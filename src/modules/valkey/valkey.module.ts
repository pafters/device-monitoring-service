import { Logger, Module } from '@nestjs/common';

import { ValkeyConnection } from '#modules/valkey/valkey.connection';
import { ValkeyService } from '#modules/valkey/valkey.service';
import { SystemConfigModule } from '#modules/system-config/system-config.module';

@Module({
  imports: [SystemConfigModule],
  providers: [Logger, ValkeyConnection, ValkeyService],
  exports: [ValkeyService],
})
export class ValkeyModule {}
