# Knowledge Base — Sahayog (sahayog-e767)

Environment QA, https://sahyogagentweb.drutam.in:9634/login, browser chromium, role User (`.env` TEST_USERNAME / TEST_PASSWORD; no credential values recorded). Generated 2026-11-04.

## Overview
Sahayog (page title "Drutam Origination") is a bank-staff web portal for customer onboarding and loan origination. A user signs in at /login and lands on /HOME, which has alerts, notifications and a "Savings Application" entry. Four nav items are visible to the test role: Home, My Profile, Notifications, About Us. Only the Login module has a requirements document; the other pages are documented from live exploration only. Items tagged [NOT VERIFIED], [GAP] or [CONFLICT] are carried forward and are not firm rules. [doc: US_001_Login.md], [page: /HOME]

## Modules
| Order | ID | Name | Icon | Pages | Source |
|---|---|---|---|---|---|
| 1 | login | Login | LogIn | /login | page: /login |
| 2 | home | Home | LayoutDashboard | /HOME | page: /HOME |
| 3 | about-us | About Us | Info | /ABOUT_US | page: /ABOUT_US |
| 4 | my-profile | My Profile | UserCircle | /MY_PROFILE | page: /MY_PROFILE |
| 5 | notifications | Notifications | Bell | /NOTIFICATIONS | page: /NOTIFICATIONS |

No module is skipped (notes.md: "No notes.").

## Roles
| Name | Key | Permissions | Source |
|---|---|---|---|
| User | (none) | Sign in; Home, My Profile, Notifications, About Us; read-only profile; profile menu (My Profile, Change Password, Change Language, Logout) | project.json; page: /HOME |

## Flows
| ID | Module | Name | Steps | Source |
|---|---|---|---|---|
| FLOW-LOGIN-01 | login | Valid sign-in | /login → enter User Id, Password → Login → /HOME | page |
| FLOW-LOGIN-02 | login | Rejected sign-in | wrong credentials + Enter → toast, stay on /login | page: /login |
| FLOW-LOGIN-03 | login | Logout | avatar → Logout → /login + toast; /HOME redirects to /login | page |
| FLOW-HOME-01 | home | Side navigation | nav click changes URL | page: /HOME |
| FLOW-HOME-02 | home | Profile menu | avatar lists 4 entries | page: /HOME |
| FLOW-NOTIF-01 | notifications | Paging | 5 per page, Previous disabled on page 1 | page: /NOTIFICATIONS |

## Entities
| Name | Module | C | R | U | D | Where | Source |
|---|---|---|---|---|---|---|---|
| User session/token | login | yes | unknown | unknown | yes | oauth2/token, logout | page: network |
| Alert | home | unknown | yes | unknown | unknown | /HOME | page: /HOME |
| User profile | my-profile | no | yes | no | no | /MY_PROFILE | page |
| Notification | notifications | unknown | yes | yes (Mark All as Read, not run) | unknown | /NOTIFICATIONS | page |
| Savings Application | home | unknown | unknown | unknown | unknown | button not clicked [NOT VERIFIED] | page: /HOME |

## Business rules
| ID | Module | Rule | Verified | Source |
|---|---|---|---|---|
| BR-001 | login | User Id mandatory | yes | doc §8; page |
| BR-002 | login | Password mandatory | yes | doc §8; page |
| BR-003 | login | Email format [NOT VERIFIED] [CONFLICT] | no | doc §8 |
| BR-004 | login | Password masked | yes (screenshot) | doc §8; page |
| BR-005 | login | Auth after client validation [NOT VERIFIED] | no | doc §8 |
| BR-006 | login | Session only after successful login | yes | doc §8; page |
| BR-007 | login | Unauthorized users cannot reach protected pages | yes | doc §8; page |
| BR-008 | login | No sensitive auth error detail | yes (partial) | doc §8; page |
| BR-009 | login | Password never logged [NOT VERIFIED] | no | doc §8 |
| BR-010 | login | Enter key logs in | yes | doc §8; page |
| BR-011 | my-profile | Profile fields read-only | yes | page |
| BR-012 | notifications | 5 per page; Previous disabled on page 1 | yes | page |

## Validations
| Module | Field | Rule | Message | Verified | Source |
|---|---|---|---|---|---|
| login | User Id | Required | Enter User Id | yes | page: /login |
| login | Password | Required | Enter password | yes | page: /login |
| login | Credentials | Must be valid | The credentials you entered are incorrect | yes | page: /login |
| login | User Id | Email format | unknown | no | doc §9 |

## Integrations
| Name | Module | Purpose | Source |
|---|---|---|---|
| Auth service /sahyogUserManagementAPI/oauth2/token | login | Token issue; 400 on bad credentials | page: network |
| Email Service | login | Forgot password mail [NOT VERIFIED] | doc §3 |
| /admin/sidemenu/list | home | Role-based nav | page: network |
| Digilocker | notifications | Referenced in notification text | page |

## Acceptance criteria
| ID | Module | Type | Text | Verified | Source |
|---|---|---|---|---|---|
| AC-LOGIN-01 | login | Functional | Empty submit shows "Enter User Id", no session | yes | US_001 AC-1 |
| AC-LOGIN-02 | login | Functional | Empty password shows "Enter password" | yes | US_001 AC-2 |
| AC-LOGIN-03 | login | Business Rule | Wrong credentials: generic toast, stay on /login | yes | US_001 AC-3 |
| AC-LOGIN-04 | login | Functional | Valid credentials land on /HOME | yes | US_001 AC-4 |
| AC-LOGIN-05 | login | Functional | Logout returns to /login; /HOME blocked | yes | US_001 AC-5 |
| AC-LOGIN-06 | login | UI | Password masked | yes | US_001 AC-6 |
| AC-HOME-01 | home | Functional | Nav URLs /HOME, /MY_PROFILE, /NOTIFICATIONS, /ABOUT_US | yes | US_002 AC-1 |
| AC-HOME-02 | home | UI | Avatar menu has 4 entries | yes | US_002 AC-4 |
| AC-HOME-03 | home | Business Rule | /HOME without session → /login | yes | US_002 AC-5 |
| AC-PROFILE-01 | my-profile | Functional | All fields disabled | yes | US_002 AC-2 |
| AC-NOTIF-01 | notifications | Functional | ≤5 per page; Previous disabled on page 1 | yes | US_002 AC-3 |

## Glossary
| Term | Meaning | Source |
|---|---|---|
| Sahayog / Drutam Origination | Onboarding and loan origination portal | page |
| Branch Origination Officer | Role label on My Profile | page: /MY_PROFILE |
| Digilocker | Document service in notification text | page |
| eKYC | Electronic KYC capability on About Us | page: /ABOUT_US |

## Gaps and conflicts
| ID | Module | Question | Needed | Source |
|---|---|---|---|---|
| GAP-001 | login | Password toggle behaviour / input type | Tool permission or rerun | US_001 GAP-1 |
| GAP-002 | login | Forgot Password / Forgot User ID / Activate Account flows | Test mailbox, sign-off | US_001 GAP-2 |
| GAP-003 | login | Locked account, password policy, session timeout | Accounts, policy | US_001 GAP-3 |
| GAP-004 | login | Other roles | Credentials | US_001 GAP-4 |
| GAP-005 | home | No requirements for non-login pages | Documents | US_002 |
| GAP-006 | home | Badges, Important tab, View All, Savings Application | Docs / safe data | US_002 |
| GAP-007 | notifications | Unread tab, page sizes, pages 2-4, Mark All as Read | Data-change approval | US_002 |
| GAP-008 | home | Change Password / Change Language unopened | Approval | US_002 |
| GAP-009 | home | Content appears in a frame; locator impact | DOM inspection | US_002 |
| GAP-010 | login | [CONFLICT] "Email ID" + email format (doc) vs "User Id" (live) | Stakeholder decision | US_001 CONFLICT-1,4 |
| GAP-011 | login | [CONFLICT] "Dashboard" (doc) vs /HOME (live) | Stakeholder | US_001 CONFLICT-2 |
| GAP-012 | login | [CONFLICT] Doc: Forgot Password + footer only; live: extra links, no copyright seen | Stakeholder | US_001 CONFLICT-3 |
| GAP-013 | login | Untested security/edge cases (SQLi, XSS, long input, rapid click, offline, multi-tab, back after logout, storage, CSRF, responsive, Tab order) | Stage 4 | US_001 |

Note: the source document embeds a plaintext username and password; they are intentionally not reproduced here.
