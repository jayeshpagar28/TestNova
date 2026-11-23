/**
 * Test data. Specs take every value from here: no literals, no credentials.
 *
 * Credentials come from .env on this PC only (written by the Setup screen),
 * never from project.json, logs or reports. A role with no credentials yields
 * empty strings, and the auth fixture skips the test with the reason instead of
 * typing blanks into the login form.
 *
 * Generated suites add their module data below (or in a workbook read through
 * ./data-sheet.ts when a row can only be used once).
 */
import { loadEnv } from '../utils/load-env.js';
import { activeProject, credentialsFor, type Credentials } from '../utils/project.js';

loadEnv();

export type User = Credentials;

const project = activeProject();

/** Every configured role's credentials, keyed by role key ('' is the default role). */
export const users: Readonly<Record<string, User>> = Object.fromEntries(
  (project?.roles ?? [{ name: 'Default', key: '' }]).map((r) => [r.key, credentialsFor(r.key)]),
);

/** The default role. */
export const defaultUser: User = credentialsFor('');

/** Values that are never valid for any account. Safe to use for negative tests. */
export const invalid = {
  username: 'testnova.invalid.user@example.invalid',
  password: 'Not-The-Password-42!',
} as const;

/** Routes of the app (relative to baseURL). */
export const routes = {
  login: '/login',
  home: '/HOME',
  profile: '/MY_PROFILE',
  notifications: '/NOTIFICATIONS',
  about: '/ABOUT_US',
  changePassword: '/CHANGE_PASSWORD',
  language: '/LANGUAGE',
  savings: '/UNPOSTED',
} as const;

export const protectedRoutes = [routes.home, routes.profile, routes.notifications, routes.about] as const;

/** Side navigation entries in order, with the route each opens. */
export const navItems = [
  { label: 'Home', path: routes.home },
  { label: 'My Profile', path: routes.profile },
  { label: 'Notifications', path: routes.notifications },
  { label: 'About Us', path: routes.about },
] as const;

export const avatarMenuItems = ['My Profile', 'Change Password', 'Change Language', 'Logout'] as const;

/** Messages the app is specified to show. */
export const messages = {
  userIdRequired: 'Enter User Id',
  passwordRequired: 'Enter password',
  credentialsIncorrect: 'The credentials you entered are incorrect',
  logoutSuccess: 'Logout Successfully',
  currentPasswordRequired: 'Enter current password',
  newPasswordRequired: 'Enter new password',
  confirmPasswordRequired: 'Enter confirm password',
} as const;

/** Hostile and awkward input for field-validation cases. */
export const inputs = {
  sqlInjection: "' OR 1=1 --",
  script: '<script>alert(1)</script>',
  unicode: 'ऋषि测试😀',
  notAnEmail: 'abc',
  long: 'A'.repeat(520),
} as const;

export const profile = {
  roleLabel: 'Branch Origination Officer',
  fields: ['Name', 'Gender', 'Date of Birth', 'mobile number', 'Email id', 'Address'],
  mobileDigits: 10,
} as const;

export const aboutUs = {
  sections: ['Key Capabilities', 'Powerful Features', 'Platform Benefits'],
  capabilities: ['Customer Profiling', 'Document Collection', 'eKYC', 'Application Submission'],
} as const;

export const notificationsData = {
  pageSize: 5,
  pageSizeOptions: ['5', '10', '20', '30'],
  digilocker: /Digilocker/i,
} as const;

export const languages = ['English', 'मराठी'] as const;

export const alerts = { heading: 'Alerts & Internal Updates', tabs: ['All', 'Important'] as const } as const;

/** Milliseconds a delayed API call is held in "pending" cases. */
export const pendingMs = 3_000;

/** Viewports for responsive cases (test type 11, web conditions). */
export const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
} as const;
