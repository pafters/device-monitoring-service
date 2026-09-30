import { ConfigurationBindsCacheKIndexItemType } from "#cache/types/ConfigurationBindsCacheKIndexItem.type";
import { AlarmConfigurationBlacklistBinds } from "#entities/alarm_configuration_blacklist_binds.entity";

export type ConfigurationBlackListBindsCacheType = {
    items: AlarmConfigurationBlacklistBinds[];
    kIndexes: Map<string, ConfigurationBindsCacheKIndexItemType>;
}