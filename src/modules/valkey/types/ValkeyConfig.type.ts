export type ValkeyConfigType = {
  host: string | undefined;
  port: number | undefined;
  db: number | undefined;
  username?: string | undefined;
  password?: string | undefined;
  changesChannel: string;
};
