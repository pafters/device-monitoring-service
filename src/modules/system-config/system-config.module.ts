import { Logger, Module } from '@nestjs/common';
import { SystemConfigService } from '#modules/system-config/system-config.service';

@Module({
  providers: [Logger, SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
