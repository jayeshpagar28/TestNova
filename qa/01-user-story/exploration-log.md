# Exploration log — Sahayog [QA], Chromium, role User (TEST_USERNAME)

| # | URL | Action | Screenshot | Console / network |
|---|---|---|---|---|
| 1 | /login | Opened (arrived with toast "Logout Successfully" from a prior session) | evidence/login/login-initial.png | Console: "Token: undefined" x2. versiondtl 200, allLogo 200 |
| 2 | /login | Blank submit -> "Enter User Id" | — | no new requests |
| 3 | /login | Wrong user id + password, Enter -> toast "The credentials you entered are incorrect" | — | oauth2/token 400; console error "Failed to load resource 400"; app log "#ERROR" |
| 4 | /login | Blank password -> "Enter password" | evidence/login/login-password-filled.png | — |
| 5 | /login | Clicked "Forgot Password ?" -> no visible change | — | no new errors |
| 6 | /login -> /HOME | Valid sign-in | evidence/home/home.png | oauth2/token 200, user/data 200, sidemenu/list 200 (x2), notification/list 200, alert list 200; console: 3 logs, 0 errors (logs a request payload containing the user id) |
| 7 | /MY_PROFILE | Opened | evidence/my-profile/my-profile.png | no errors |
| 8 | /NOTIFICATIONS | Opened | evidence/notifications/notifications.png | no errors |
| 9 | /ABOUT_US | Opened, opened avatar menu | evidence/about-us/about-us.png | no errors |
| 10 | /ABOUT_US -> /login | Logout -> toast "Logout Successfully" | — | 3 console log entries |
| 11 | /HOME (signed out) | Direct URL -> redirected to /login | — | — |

Not done (blocked in this run): reading input type / storage via evaluate, clicking the password toggle (coordinate click denied), keyboard Tab-order testing, reload mid-flow, responsive viewports.
Credentials: values were read from `.env` only to type them into the login form; they are not recorded here.
