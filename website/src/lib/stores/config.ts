import { persisted } from 'svelte-local-storage-store';
import { writable } from 'svelte/store';

type Config = {
  radius: number;
};

export const config = persisted<Config>('config', {
  radius: 0.5,
});

export const cart_open = writable(false);
