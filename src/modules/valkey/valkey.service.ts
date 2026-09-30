import { Inject, Injectable, Logger, LoggerService } from '@nestjs/common';
import { addContextDecoratorLogger } from '#infrastructure/logger/context.decorator.logger';
import { ValkeyConnection } from '#modules/valkey/valkey.connection';
import { ValkeyItemType } from '#modules/valkey/types/ValkeyItem.type';
import { ValkeySuffixItem } from '#modules/valkey/types/ValkeySuffixItem.type';
import { chunkArray } from '#helpers/chunkArray.helper';
import { safeParse } from '#helpers/safeParse.helper';
import { ValkeyItemWithHandledValueType } from './types/ValkeyItemWithValue.type';

@Injectable()
export class ValkeyService {
  constructor(
    @Inject(Logger) private readonly logger: LoggerService,
    private readonly valkeyConn: ValkeyConnection,
  ) {
    this.logger = addContextDecoratorLogger(logger, ValkeyService.name);
  }

  public generateValkeyKey(alias: string, modem_id: number, device_id: number): string {
    const aliasType = alias.toLowerCase().startsWith('modem') ? 'modem' : 'device';
    const objectId = aliasType === 'modem' ? modem_id : device_id;
    const key = `${aliasType}/${objectId}/${alias}`;
    return key;
  }

  async getLiveDataByValkeyKey(key: string): Promise<ValkeyItemType | null> {
    try {
      const type = await this.valkeyConn.valkeyClient.type(key);

      if (type !== 'string') {
        throw new Error(
          `getValueKey Failed With incorrect type=${type} for polling data key=${key}. Expected type='string'`,
        );
      }
      const liveData = await this.valkeyConn.valkeyClient.get(key);
      if (liveData) {
        const parsedData: ValkeyItemType = safeParse(liveData);
        return parsedData;
      }
      return null;
    } catch {
      // this.logger.error(error);
      return null;
    }
  }

  async getLiveDataWithHandledValueByAliasAndModemDeviceInfo(alias: string, modem_id: number, device_id: number) {
    try {
      // генерируем ключ valkey
      const valkeyKey = this.generateValkeyKey(alias, modem_id, device_id);

      // получаем данные по пришедшему по устройству параметру 
      const deviceAliasValkeyData = await this.getLiveDataWithHandledValueByValkeyKey(valkeyKey);

      // если не находим оперативные данные по датчику, то считаем это ошибкой и фиксируем ее
      if (deviceAliasValkeyData === undefined) {
        this.logger.error(
          `(getLiveDataWithHandledValueByAliasAndModemDeviceInfo) valkeyData for key "${valkeyKey}", alias="${alias}" device_id="${device_id}" and modem_id="${modem_id}" not found`
        );
        return undefined;
      }
      return { valkeyKey, deviceAliasValkeyData }
    } catch (e) {
      this.logger.error(
        `(getLiveDataWithHandledValueByAliasAndModemDeviceInfo) ERROR while getting live data with handledValue for alias="${alias}" device_id="${device_id}" and modem_id="${modem_id}"`
      );
      this.logger.error(e);
      return undefined;
    }

  }

  // определяет значения с датчика, и возвращает запись valkey и его значение либо undefined если ничего не находит
  async getLiveDataWithHandledValueByValkeyKey(valkeyKey: string):
    Promise<ValkeyItemWithHandledValueType | undefined> {
    try {
      // получаем запись из valkey
      const liveData = await this.getLiveDataByValkeyKey(valkeyKey);

      // если записи в valkey нет, то возвращаем отсутствие значение
      if (!liveData) {
        return undefined;
      }

      // получаем значение с датчика
      const value = liveData.value ?? liveData.value_string ?? liveData.value_bool;

      // если значение с датчика невалидно, то возвращаем отсутствие значение
      if (value === null || value === undefined) {
        this.logger.warn(
          `(checkValkeyDataOnAlarms) no data for key="${valkeyKey}"`
        );
        return undefined;
      }

      return { liveData, value };
    } catch (e) {
      this.logger.error(e);
      return undefined;
    }

  }


  // Подписка на изменения (например, на событие пуша)
  async subscribeToChanges(
    channel: string,
    callback: (message: string) => void | Promise<void>,
  ): Promise<void> {
    await this.valkeyConn.valkeySubscriber.subscribe(channel);
    this.logger.log(`Subscribed to Valkey channel: ${channel}`);
    this.valkeyConn.valkeySubscriber.on(
      'message',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (channelName, message) => {
        try {
          if (channelName === channel) {
            await callback(message);
          }
        } catch (e) {
          this.logger.error(`ERROR (subscribeToChanges):`, e);
        }
      },
    );
  }

  async unsubscribeFromChanges(channel: string): Promise<void> {
    await this.valkeyConn.valkeySubscriber.unsubscribe(channel);
    this.logger.log(`Unsubscribed from Valkey channel: ${channel}`);
  }

  async getValuesBySuffix(suffix: string): Promise<ValkeySuffixItem[]> {
    const stream = this.valkeyConn.valkeyClient.scanStream({
      match: `*${suffix}`,
      count: 10000,
    });

    const allData: ValkeySuffixItem[] = [];

    for await (const keys of stream) {
      const strKeys = keys as string[];
      if (strKeys.length === 0) continue;

      const values = await this.valkeyConn.valkeyClient.mget(strKeys);

      for (let index = 0; index < strKeys.length; index++) {
        const value = values[index];
        const key = strKeys[index];

        if (value !== null)
          allData.push({ key, value: JSON.parse(value) as ValkeyItemType });
      }
    }
    return allData;
  }

  async getValuesByArrayKeys(arrayKeys: string[]): Promise<ValkeyItemType[]> {
    const valkeyKeysChunks = chunkArray(arrayKeys, 5000);
    const dataArray: ValkeyItemType[] = [];
    for (const chunk of valkeyKeysChunks) {
      const chunkValuesString = await this.valkeyConn.valkeyClient.mget(chunk);
      const existData = chunkValuesString.filter(x => typeof x === 'string');
      for (const existDataItem of existData) {
        const valkeyItem = safeParse(existDataItem) as ValkeyItemType | null;
        if (valkeyItem === null) {
          continue;
        }
        dataArray.push(valkeyItem);
      }
    }
    return dataArray;
  }

}
