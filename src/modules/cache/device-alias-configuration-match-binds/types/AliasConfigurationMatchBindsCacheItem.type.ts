import { PreparedAlarmConfigurationType } from "#modules/cache/alarm-configuration/types/PreparedAlarmConfiguration.type";

export type AliasConfigurationMatchBindsCacheItemType = {
    configList: PreparedAlarmConfigurationType[],
    createdAt: string
}
