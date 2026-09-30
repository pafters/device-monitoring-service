import { Logger, Module } from '@nestjs/common';

import { SystemConfigModule } from '#modules/system-config/system-config.module';
import { AlarmProcessorService } from '#modules/alarm-processor/alarm-processor.service';
import { BaseCacheModule } from '#cache/base-cache.module';
import { ValkeyModule } from '#modules/valkey/valkey.module';
import { CheckOnAlarmsModule } from '#modules/check-on-alarms/check-on-alarms.module';

@Module({
    imports: [
        SystemConfigModule,
        BaseCacheModule,
        ValkeyModule,
        CheckOnAlarmsModule,
    ],
    providers: [Logger, AlarmProcessorService],
    exports: [AlarmProcessorService],
})
export class AlarmProcessorModule { }