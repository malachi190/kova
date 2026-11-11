import { Module } from '@nestjs/common';
import { VendorsDatabase } from './vendors.database';
import { VendorsService } from './vendors.service';

@Module({
  providers: [VendorsDatabase, VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
