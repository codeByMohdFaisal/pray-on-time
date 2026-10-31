import { requireOptionalNativeModule } from 'expo';

export interface AlarmStatus {
  exactAllowed: boolean;
  notificationsAllowed: boolean;
  audioReady: boolean;
  lastSync: number;
  syncError: string;
}
interface AzanAlarm {
  status(): AlarmStatus;
  getState(): string | null;
  configure(state: string): void;
  openExactSettings(): void;
  importAudio(uri: string): Promise<void>;
  test(mode: string): void;
  stopAudio(): void;
}
export default requireOptionalNativeModule<AzanAlarm>('AzanAlarm');
