import { Module } from '@nestjs/common';
import { BaseCacheModule } from './modules/cache/base-cache.module';
import { ValkeyModule } from './modules/valkey/valkey.module';
import { M500Module } from './modules/postgres/m500.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { envPathProvider } from './infrastructure/env.path.provider';
import { ConfigModule } from '@nestjs/config';
import { AlarmProcessorModule } from './modules/alarm-processor/alarm-processor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: envPathProvider(),
      isGlobal: true,
    }),
    SystemConfigModule,
    M500Module,
    ValkeyModule,
    AlarmProcessorModule,
    BaseCacheModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
