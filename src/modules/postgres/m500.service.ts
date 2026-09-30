import { Inject, Injectable, Logger, LoggerService } from '@nestjs/common';

import { addContextDecoratorLogger } from '#infrastructure/logger/context.decorator.logger';
import { M500Connection } from '#modules/postgres/m500.connection';
import { Device } from '#entities/devices.entity';
import { AlarmConfiguration } from '#entities/alarm_configurations.entity';
import { AlarmConfigurationBinds } from '#entities/alarm_configuration_binds.entity';
import { AlarmConfigurationBlacklistBinds } from '#entities/alarm_configuration_blacklist_binds.entity';
import { DeviceLocationSiteItemType } from '#modules/postgres/types/DeviceLocationSiteItem.type';
import { LocationBindsItemType } from '#modules/postgres/types/LocationBindsItem.type';
import { AlarmActiveAlarmsWithAliasItemType } from '#modules/postgres/types/AlarmActiveAlarmsWithAliasItem.type';
import { AlarmFinishedAlarms } from '#entities/alarm_finished_alarms.entity';
import { AlarmFinishedAlarmAwaitConfirmation } from '#entities/alarm_finished_alarm_await_confirmation.entity';
import { ServerModemDeviceBindsItemWithModemData } from './types/ServerModemDeviceBindsItemWithModemData.type';
import { EntityManager, InsertResult } from 'typeorm';
import { AlarmActiveAlarmsDTO } from '#/dto/AlarmActiveAlarms.dto';
import { AlarmFinishedAlarmAwaitConfirmationDTO } from '#/dto/AlarmFinishedAlarmAwaitConfirmation.dto';
import { AlarmFinishedAlarmsDTO } from '#/dto/AlarmFinishedAlarms.dto';
import { AlarmUserAcknowledgement } from '#entities/alarm_user_acknowledgement.entity';

@Injectable()
export class M500Service {
  constructor(
    @Inject(Logger) private readonly logger: LoggerService,
    private readonly m500Connection: M500Connection,
  ) {
    this.logger = addContextDecoratorLogger(logger, M500Service.name);
  }

  async getDevices(): Promise<Device[]> {
    try {
      const query = `
        SELECT 
          device_id,
          model_id,
          location_id,
          server_alias_template_id
        FROM devices;
      `;

      const devices = await this.m500Connection.getRawSql(query);
      return devices;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getServerModemDeviceBindsWithModemData(): Promise<ServerModemDeviceBindsItemWithModemData[]> {
    try {
      const query = `
        SELECT
          modem_id,
          device_id,
          server_id,
          jsonb_build_object(
            'modem_id', m.id,
            'name', m.name,
            'guid', m.guid
          ) AS "Modem"
        FROM server_modem_device_binds
        JOIN modems m ON m.id = modem_id;
      `;
      return await this.m500Connection.getRawSql(query);
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getDeviceLocationSites(): Promise<DeviceLocationSiteItemType[]> {
    try {
      const query = `
        SELECT 
          d.id AS device_id,
          d.name as device_name,
          d.model_id,
          d.location_id,
          d.server_alias_template_id,
          l.site_id,
          l.name as location_name,
          models.name as model_name,
          sat.name as server_alias_template_name
        FROM devices d
        JOIN locations l ON l.id = d.location_id
        JOIN models ON models.id = d.model_id
        JOIN server_alias_templates sat ON sat.id = d.server_alias_template_id
        WHERE 
          d.location_id IS NOT NULL
          AND d.server_alias_template_id IS NOT NULL
          AND d.model_id IS NOT NULL
          AND l.site_id IS NOT NULL;
      `;

      const devices = await this.m500Connection.getRawSql(query);
      return devices;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getUserAlarmConfirmItemByAlarmActivationGUID(alarm_activation_guid: string): Promise<AlarmUserAcknowledgement | undefined> {
    const query = `
      SELECT alarm_user_acknowledgement_id
      FROM alarm_user_acknowledgement
      WHERE alarm_activation_guid = '${alarm_activation_guid}'
      LIMIT 1;
    `
    const confirmItem: AlarmUserAcknowledgement[] = await this.m500Connection.getRawSql(query);
    return confirmItem[0];
  }

  async getLocationSiteBinds(): Promise<LocationBindsItemType[]> {
    try {
      const query = `
        SELECT 
          l.id,
          l.name,
          l.location_id,
          s.name as site_name
        FROM 
          locations l
        JOIN sites s
          ON s.id = l.site_id
        WHERE 
          site_id IS NOT NULL;
      `;

      const devices = await this.m500Connection.getRawSql(query);
      return devices;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getExistAlarmConfigurations(): Promise<AlarmConfiguration[]> {
    try {
      const query = `
        SELECT *
        FROM alarm_configurations
        WHERE deleted_at IS NULL; 
      `;

      const data: AlarmConfiguration[] = await this.m500Connection.getRawSql(query);

      return data;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getActiveAlarmConfigurationBinds(): Promise<AlarmConfigurationBinds[]> {
    try {
      const query = `
        SELECT acb.*
        FROM alarm_configuration_binds acb
        JOIN alarm_configurations ac 
          ON acb.alarm_config_id = ac.alarm_config_id
        WHERE ac.deleted_at IS NULL;
      `;

      const data: AlarmConfigurationBinds[] = await this.m500Connection.getRawSql(query);

      return data;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getAlarmConfigurationBlackListBinds(): Promise<AlarmConfigurationBlacklistBinds[]> {
    try {
      const query = `
        SELECT acbb.*
        FROM alarm_configuration_blacklist_binds acbb
        JOIN alarm_configurations ac 
          ON acbb.alarm_config_id = ac.alarm_config_id
        WHERE ac.deleted_at IS NULL;
      `;

      const data: AlarmConfigurationBlacklistBinds[] = await this.m500Connection.getRawSql(query);

      return data;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getAllAlarmActiveAlarms(): Promise<AlarmActiveAlarmsWithAliasItemType[]> {
    try {
      const query = `
        SELECT 
          active_alarms.*,
          alarm_config.alias
        FROM alarm_active_alarms active_alarms
        LEFT JOIN alarm_configurations alarm_config
          ON active_alarms.alarm_config_id = alarm_config.alarm_config_id;
      `;

      const data: AlarmActiveAlarmsWithAliasItemType[] = await this.m500Connection.getRawSql(query);

      return data;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async addAlarmToActiveAlarms(data: AlarmActiveAlarmsDTO): Promise<InsertResult> {
    const item = this.m500Connection.alarmActiveAlarmsRepository.create(data);
    const alarm = await this.m500Connection.alarmActiveAlarmsRepository.insert(item);
    return alarm
  }

  async addAlarmToFinishedAlarms(data: AlarmFinishedAlarmsDTO): Promise<InsertResult> {
    const item = this.m500Connection.alarmFinishedAlarmsRepository.create(data);
    const alarm = await this.m500Connection.alarmFinishedAlarmsRepository.insert(item);
    return alarm;
  }

  async addAlarmToFinishedAlarmsAwaitConfirmation(data: AlarmFinishedAlarmAwaitConfirmationDTO): Promise<InsertResult> {
    const item = this.m500Connection.alarmFinishedAlarmsAwaitConfirmationRepository.create(data);
    const alarm = await this.m500Connection.alarmFinishedAlarmsAwaitConfirmationRepository.insert(item);
    return alarm;
  }

  // Добавление в таблицу завершенных аварий по транзакции
  async addAlarmToFinishedAlarmsWithTransaction(
    data: AlarmFinishedAlarmsDTO,
  ) {
    try {
      const query = `
      WITH moved AS (
        DELETE FROM alarm_active_alarms
        WHERE alarm_activation_guid = $1
        RETURNING 1
      )
      INSERT INTO alarm_finished_alarms (
        alarm_activation_guid,
        alarm_config_id,
        device_id,
        activation_value,
        dt_start,
        dt_end,
        finish_reason,
        debug_info
      )
      SELECT
        $1,
        $2,
        $3,
        $4,
        $5 AS dt_start,
        $6 AS dt_end,
        $7 AS finish_reason,
        $8::json AS debug_info;
    `;

      const params = [
        data.alarm_activation_guid,
        data.alarm_config_id,
        data.device_id,
        data.activation_value,
        data.dt_start,
        data.dt_end,
        data.finish_reason,
        data.debug_info
      ];

      const result = await this.m500Connection.getRawSql(query, params)
    } catch (e) {
      // Если произошла ошибка, обязательно выполнить ROLLBACK
      this.logger.error(`(addAlarmToFinishedAlarmsWithTransaction) ERROR WHILE PROCESSING REMOVING FROM alarm_active_alarms AND INSERTING INTO alarm_finished_alarms`);
      this.logger.error(e);
      throw e;
    }

  }

  // Добавление в таблицу завершенных аварий, ожидающих квитирования, по транзакции
  async addAlarmToFinishedAlarmsAwaitConfirmationWithTransaction(
    data: AlarmFinishedAlarmAwaitConfirmationDTO,
  ) {
    try {
      const query = `
      WITH moved AS (
        DELETE FROM alarm_active_alarms
        WHERE alarm_activation_guid = $1
        RETURNING 1
      )
      INSERT INTO alarm_finished_alarm_await_confirmation (
        alarm_activation_guid,
        alarm_config_id,
        device_id,
        activation_value,
        dt_start,
        dt_end,
        finish_reason,
        debug_info
      )
      SELECT
        $1,
        $2,
        $3,
        $4,
        $5 AS dt_start,
        $6 AS dt_end,
        $7 AS finish_reason,
        $8::json AS debug_info;
    `;

      const params = [
        data.alarm_activation_guid,
        data.alarm_config_id,
        data.device_id,
        data.activation_value,
        data.dt_start,
        data.dt_end,
        data.finish_reason,
        data.debug_info
      ];

      const result = await this.m500Connection.getRawSql(query, params)
    } catch (e) {
      // Если произошла ошибка, обязательно выполнить ROLLBACK
      this.logger.error(`(addAlarmToFinishedAlarmsWithTransaction) ERROR WHILE PROCESSING REMOVING FROM alarm_active_alarms AND INSERTING INTO alarm_finished_alarms`);
      this.logger.error(e);
      throw e;
    }
  }

  async removeAlarmFromActiveAlarms(alarm_config_id: number, device_id: number): Promise<void> {
    try {
      if (alarm_config_id === undefined) {
        throw new Error('(removeAlarmFromActiveAlarms) the column alarm_config_id cannot be undefined');
      }

      if (device_id === undefined) {
        throw new Error('(removeAlarmFromActiveAlarms) the column device_id cannot be undefined');
      }

      const query = `
      DELETE FROM alarm_active_alarms
      WHERE 
        device_id=${device_id}
        AND alarm_config_id=${alarm_config_id};
    `;

      await this.m500Connection.getRawSql(query);
    }
    catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getLastAlarmFinishedAlarms(): Promise<AlarmFinishedAlarms[]> {
    const query = `
      SELECT DISTINCT ON (alarm_config_id, device_id)
        alarm_config_id,
        dt_end,
        device_id,
        alarm_activation_guid
      FROM alarm_finished_alarms
      ORDER BY alarm_config_id, device_id, dt_end DESC;
    `;

    const data: AlarmFinishedAlarms[] = await this.m500Connection.getRawSql(query);

    return data;
  }

  async getAlarmFinishedAlarmsAwaitConfirmation(): Promise<AlarmFinishedAlarmAwaitConfirmation[]> {
    const query = `
      SELECT DISTINCT ON (alarm_config_id, device_id)
        alarm_config_id,
        dt_end,
        device_id,
        alarm_activation_guid
      FROM alarm_finished_alarm_await_confirmation
      ORDER BY alarm_config_id, device_id, dt_end DESC;
    `;

    const data: AlarmFinishedAlarmAwaitConfirmation[] = await this.m500Connection.getRawSql(query);

    return data;
  }

  async deleteAllActiveAlarmsByDeviceId(device_id: number): Promise<void> {
    if (!device_id) {
      throw new Error(
        `(deleteAllActiveAlarmsByDeviceId) ERROR column device_id connot be undefined`
      );
    }
    const query = `
      DELETE FROM alarm_active_alarms
      WHERE device_id = ${device_id};
    `;

    await this.m500Connection.getRawSql(query);
  }

  async deleteAllActiveAlarmsByDeviceIdAlarmConfigId(device_id: number, alarm_config_id: number): Promise<void> {
    if (!device_id) {
      throw new Error(
        `(deleteAllActiveAlarmsByDeviceId) ERROR column device_id connot be undefined`
      );
    }

    if (!alarm_config_id) {
      throw new Error(
        `(deleteAllActiveAlarmsByDeviceId) ERROR column alarm_config_id connot be undefined`
      );
    }

    const query = `
      DELETE FROM alarm_active_alarms
      WHERE 
        device_id = ${device_id}
        AND alarm_config_id = ${alarm_config_id};
    `;

    await this.m500Connection.getRawSql(query);
  }
}
