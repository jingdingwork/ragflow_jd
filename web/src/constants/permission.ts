export enum PermissionRole {
  Me = 'me',
  Team = 'team',
  Department = 'department',
  /** Set by an administrator in the admin console only; read-only in the user UI. */
  Company = 'company',
}
