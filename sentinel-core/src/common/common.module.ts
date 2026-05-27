import { Module, Global } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { NotificationService } from './notification.service';

@Global()
@Module({
  providers: [CryptoService, NotificationService],
  exports: [CryptoService, NotificationService],
})
export class CommonModule {}
