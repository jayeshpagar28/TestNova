import { test as base, expect } from './test.js';
import { LoginPage } from '../pages/login.page.js';
import { HomePage } from '../pages/home.page.js';
import { AboutUsPage } from '../pages/about-us.page.js';
import { MyProfilePage } from '../pages/my-profile.page.js';
import { NotificationsPage } from '../pages/notifications.page.js';
import { ChangePasswordPage } from '../pages/change-password.page.js';
import { LanguagePage } from '../pages/language.page.js';
import { SavingsApplicationPage } from '../pages/savings-application.page.js';
import { TopBar } from '../components/top-bar.component.js';
import { SideNav } from '../components/side-nav.component.js';
import { Toast } from '../components/toast.component.js';

/**
 * Page-object registry. Every page and component is a fixture here, so specs
 * import `test` from this file and never construct a page object or touch a
 * raw locator.
 *
 * `signedIn` establishes the starting state "User is signed in and on Home" by
 * the real login form (the token lives in localStorage, which a per-test context
 * does not share). Specs request it from their own beforeEach.
 */
type Pages = {
  login: LoginPage;
  home: HomePage;
  aboutUs: AboutUsPage;
  myProfile: MyProfilePage;
  notifications: NotificationsPage;
  changePassword: ChangePasswordPage;
  language: LanguagePage;
  savingsApplication: SavingsApplicationPage;
  topBar: TopBar;
  sideNav: SideNav;
  toast: Toast;
  signedIn: HomePage;
};

export const test = base.extend<Pages>({
  login: async ({ page }, use) => use(new LoginPage(page)),
  home: async ({ page }, use) => use(new HomePage(page)),
  aboutUs: async ({ page }, use) => use(new AboutUsPage(page)),
  myProfile: async ({ page }, use) => use(new MyProfilePage(page)),
  notifications: async ({ page }, use) => use(new NotificationsPage(page)),
  changePassword: async ({ page }, use) => use(new ChangePasswordPage(page)),
  language: async ({ page }, use) => use(new LanguagePage(page)),
  savingsApplication: async ({ page }, use) => use(new SavingsApplicationPage(page)),
  topBar: async ({ page }, use) => use(new TopBar(page)),
  sideNav: async ({ page }, use) => use(new SideNav(page)),
  toast: async ({ page }, use) => use(new Toast(page)),

  signedIn: async ({ login, home, credentials }, use) => {
    await login.open();
    await login.signIn(credentials());
    await home.waitUntilLoaded();
    await use(home);
  },
});

export { expect };
