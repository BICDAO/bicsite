import * as migration_20260911_054430_initial from './20260911_054430_initial';
import * as migration_20260911_060410_footer_memes_wallet_signin from './20260911_060410_footer_memes_wallet_signin';

export const migrations = [
  {
    up: migration_20260911_054430_initial.up,
    down: migration_20260911_054430_initial.down,
    name: '20260911_054430_initial',
  },
  {
    up: migration_20260911_060410_footer_memes_wallet_signin.up,
    down: migration_20260911_060410_footer_memes_wallet_signin.down,
    name: '20260911_060410_footer_memes_wallet_signin'
  },
];
