import { AlarmConfigurationBinds } from "#entities/alarm_configuration_binds.entity";
import { ConfigurationBindsCacheKIndexItemType } from "#cache/types/ConfigurationBindsCacheKIndexItem.type";

export type ConfigurationBindsCacheType = {
    items: AlarmConfigurationBinds[];
    kIndexes: Map<string, ConfigurationBindsCacheKIndexItemType>;
}