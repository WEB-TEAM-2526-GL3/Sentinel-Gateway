import { Injectable} from '@nestjs/common'
import {
  ActivateFallbackInput,
  KongAdapterInterface,
} from 'src/interfaces/kong-adapter.interface';

@Injectable()
export class KongAdapterService implements KongAdapterInterface {
  readonly activatedFallbacks: ActivateFallbackInput[] = [];

  async activateFallback(input: ActivateFallbackInput): Promise<void> {
    this.activatedFallbacks.push(input);
  }
}
