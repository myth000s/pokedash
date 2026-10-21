import { checkServerEnv } from './lib/serverEnv';

export function register() {
  checkServerEnv(process.env);
}
