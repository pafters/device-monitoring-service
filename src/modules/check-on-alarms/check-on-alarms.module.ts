import { Logger, Module } from "@nestjs/common";
import { CheckOnAlarmsService } from "#modules/check-on-alarms/check-on-alarms.service";
import { SystemConfigModule } from "#modules/system-config/system-config.module";
import { BaseCacheModule } from "#modules/cache/base-cache.module";
import { ValkeyModule } from "#modules/valkey/valkey.module";
import { M500Module } from "#modules/postgres/m500.module";

@Module({
    imports: [
        SystemConfigModule,
        BaseCacheModule,
        ValkeyModule,
        M500Module
    ],
    providers: [Logger, CheckOnAlarmsService],
    exports: [CheckOnAlarmsService]
})
export class CheckOnAlarmsModule { }
