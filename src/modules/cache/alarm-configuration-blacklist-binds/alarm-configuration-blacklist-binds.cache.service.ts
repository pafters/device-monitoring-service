import { Inject, Logger, LoggerService } from "@nestjs/common";
import { M500Service } from "#modules/postgres/m500.service";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { ConfigurationBindsCacheKIndexItemType } from "#cache/types/ConfigurationBindsCacheKIndexItem.type";
import { AlarmConfigurationBlacklistBinds } from "#entities/alarm_configuration_blacklist_binds.entity";
import { ConfigurationBlackListBindsCacheType } from "#cache/alarm-configuration-blacklist-binds/types/ConfigurationBindsCache.type";
import { FilterConfigurationBindsType } from "#cache/types/FilterConfigurationBinds.type";

// * кэш связок исключений из проверки на алармы
export class AlarmConfigurationBlackListBindsCacheService {
    private alarmConfigurationBlackListBindsCache: ConfigurationBlackListBindsCacheType;

    private firstCacheIsInited = false;

    constructor(
        private readonly m500Service: M500Service,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, AlarmConfigurationBlackListBindsCacheService.name);
    }

    // Начальная инициализация кэша (делается один раз при старте)
    public async firstCacheInit(): Promise<void> {
        if (this.firstCacheIsInited === true) {
            this.logger.warn(`(firstCacheInit) the method has already called`);
            return;
        }
        this.logger.log(`FIRST INIITING...`);
        await this.initCache();
        this.logger.log(`FIRST INITING FINISHED.`);
    }

    // Загрузка данных и построение кэша
    public async initCache(): Promise<void> {
        try {
            // Получаем активные связки конфигураций из таблицы связок
            const data = await this.m500Service.getAlarmConfigurationBlackListBinds();
            // Строим кэш по полученным данным
            this.alarmConfigurationBlackListBindsCache = this.buildCache(data);
        } catch (e) {
            this.logger.error(`(initCache) ERROR while initializing cache`);
            this.logger.error(e);
        }
    }

    /*
      Построение полного кэша по набору записей.
      * Назначение:
      *  - собрать все встречающиеся ключи для фильтрации (кроме id конфигурации и id связки,
      *      т.к. они не участвуют в быстром поиске по кэшу)
      *  - построить индекс для каждого ключа
      *  - вернуть объект { items, kIndexes } как единый кэш
    **/
    private buildCache(items: AlarmConfigurationBlacklistBinds[]): ConfigurationBlackListBindsCacheType {
        // Собираем все встречающиеся ключи в записях
        const allKeys = new Set<string>();
        // Строим индексы для каждого ключа
        const kIndexes = new Map<string, ConfigurationBindsCacheKIndexItemType>();

        // Отделяем случай, когда элементов нет: возвращаем структуру с пустым индексом
        if (!items[0]) {
            return { items: items, kIndexes: kIndexes }
        }

        // Перебираем ключи первой записи, чтобы понять размерность
        for (const key of Object.keys(items[0])) {
            // Пропускаем идентификаторы, т.к. по ним индексы не строим
            if (key === 'alarm_configuration_blacklist_binds_id' || key === 'alarm_config_id') {
                continue;
            }
            allKeys.add(key);
        }

        // Для каждого найденного ключа строим индекс
        for (const key of allKeys) {
            kIndexes.set(key, this.buildKeyIndex(items, key));
        }

        // Возвращаем готовый кэш: данные и их индексы
        return { items, kIndexes };
    }

    /*
       Построение индекса по конкретному ключу.
       Для каждой пары (key, v) строится s = valueMap.get(v) и добавляется текущий индекс i: s.add(i).
       * key - это имя поля (ключа) из записи AlarmConfigurationBinds
       * Результат: объект { valueMap, undefSet }:
       *   - valueMap: карта значение -> множество индексов записей
       *   - undefSet: множество индексов, где значение по ключу undefined/null
     **/
    private buildKeyIndex(
        items: AlarmConfigurationBlacklistBinds[],
        key: string,
    ): ConfigurationBindsCacheKIndexItemType {
        // valueMap: карта value -> Set<idx>,
        //  то есть для каждого конкретного значения поля хранится множество индексов записей, где встречается это значение.
        const valueMap = new Map<number, Set<number>>(); // value -> Set<idx>
        // undefSet: множество индексов, где значение по ключу отсутствует (undefined или null).
        const undefSet = new Set<number>(); // idx where item[key] === undefined || null

        for (let i = 0; i < items.length; i++) {
            // * v -  конкретное значение поля key для данной записи.
            const v = items[i][key];
            if (v === null || v === undefined) {
                undefSet.add(i);
            } else {
                let s = valueMap.get(v);
                if (!s) {
                    s = new Set();
                    valueMap.set(v, s);
                }
                s.add(i);
            }
        }

        return { valueMap, undefSet };
    }

    /*
      Обеспечение наличия индекса по ключу в кэше (immutable-стиль).
      * Если индекса нет, строится новый кэш-объект с добавленным индексом для данного ключа.
    **/
    private ensureKeyIndex(cache: ConfigurationBlackListBindsCacheType, key: string): ConfigurationBlackListBindsCacheType {
        if (cache.kIndexes.has(key)) return cache;
        const newIndex = this.buildKeyIndex(cache.items, key);
        const newKIndexes = new Map(cache.kIndexes);
        newKIndexes.set(key, newIndex);
        return { ...cache, kIndexes: newKIndexes };
    }

    /*
      Поиск записей в кэше, не противоречащих заданному фильтру.
      * Если значение по ключу в связке === undefined или === null — этот ключ не ограничивает поиск
    */
    public findInCacheByFilterAndAliasConfigs(filter: FilterConfigurationBindsType, aliasConfigs: Set<number>): Set<number> {
        try {
            // Если нет алиасов для фильтра — возвращаем пустой результат
            if (aliasConfigs.size === 0) {
                return new Set<number>();
            }
            // Валидируем вход: фильтр должен быть передан
            if (filter === undefined) {
                throw new Error(`(findInCache) columm filter not found.The value was not found.The expected value must be of the type "FilterConfigurationBindsType"`);
            }
            const keys = Object.keys(filter) as Array<keyof FilterConfigurationBindsType>; // Если фильтр пустой — возвращаем копию всех записей if (keys.length === 0) { return this.alarmConfigurationBindsCache.items.slice(); }

            // Кандидаты — все исходные индексы
            let candidate = new Set<number>(this.alarmConfigurationBlackListBindsCache.items.map((_: AlarmConfigurationBlacklistBinds, idx: number) => idx));

            const candidates = new Set<number>();
            const items = this.alarmConfigurationBlackListBindsCache.items;
            for (let i = 0; i < items.length; i++) {
                const id = (items[i]).alarm_config_id;
                // если alarm_config_id входит в разрешенные aliasConfigs
                if (id !== undefined && aliasConfigs.has(id) === true) candidates.add(i);
            }

            let currentCache = this.alarmConfigurationBlackListBindsCache;

            for (const key of keys) {
                const filterValue = filter[key];
                // Игнорируем null/undefined — это не ограничивает по этому ключу
                if (filterValue === null || filterValue === undefined) continue;

                // убедимся, что индекс существует для этого ключа
                currentCache = this.ensureKeyIndex(currentCache, key);
                const idxInfo = currentCache.kIndexes.get(key as any);

                // Если нет индекса для данного ключа — пропускаем
                if (idxInfo === undefined) {
                    continue;
                }

                // разрешённые индексы для данного ключа: undefSet OR записи с нужным значением
                const allowed = new Set<number>(idxInfo.undefSet);

                // Если значение - массив, дополняем разрешённые индексы для каждого элемента массива
                if (Array.isArray(filterValue)) {
                    // * Значение v используется как ключ в valueMap, чтобы сгруппировать индексы по одинаковым значениям поля.
                    for (const v of filterValue) {
                        // пропускаем null/undefined внутри массива так как отсутствие значения в связке не означает,
                        // что она не подходит. Например если есть связка только с указанием {device_id},
                        // а все остальные фильтр-поля(model_id,site_id,...) undefined или null, это не значит, что
                        // передаваемый фильтр в аргумент функции со всеми этими заданными полями может не подходить.
                        // если у него есть такое же значение в device_id, значит эта связка ему будет подходить
                        if (v === null || v === undefined) continue;
                        const s = idxInfo.valueMap.get(v as any);
                        if (s) for (const idx of s) allowed.add(idx);
                    }
                } else {
                    // одиночное значение
                    // Получаем индексы, где значение равно filterValue
                    const s = idxInfo.valueMap.get(filterValue as any);
                    // * idx - номер позиции записи в массиве items. То есть индекс строки: 0, 1, 2 и так далее.
                    if (s) for (const idx of s) allowed.add(idx);
                }

                // пересечение: candidate = candidate ∩ allowed
                for (const idx of Array.from(candidate)) {
                    if (!allowed.has(idx)) candidate.delete(idx);
                }

                if (candidate.size === 0) break; // быстрый выход, если пусто
            }

            // возвращаем индексы найденных связок под поступивший фильтр
            return new Set(Array.from(candidate).map((i: number) => currentCache.items[i]?.alarm_config_id));
        } catch (e) {
            this.logger.error(e);
            return new Set<number>();
        }
    }
}