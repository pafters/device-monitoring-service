import { Logger, Module } from '@nestjs/common';

import { M500Service } from '#modules/postgres/m500.service';
import { M500Connection } from '#modules/postgres/m500.connection';
import { SystemConfigModule } from '#modules/system-config/system-config.module';

@Module({
  imports: [SystemConfigModule],
  providers: [Logger, M500Connection, M500Service],
  exports: [M500Service],
})
export class M500Module {}
