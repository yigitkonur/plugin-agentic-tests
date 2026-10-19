# Fixture Shop requirements

1. The home page at `/` shows the heading "Welcome to Fixture Shop" and a "Sign in" link.
2. The sign-in page at `/login` has an Email field, a Password field and a "Sign in" button.
3. Signing in with valid credentials opens `/dashboard`, whose heading is "Dashboard" and which greets the user with "Signed in as <their email>".
4. The dashboard lists the user's orders; the demo user has exactly three orders: #1001, #1002 and #1003.
5. Invalid credentials keep the user on `/login` and show "Invalid email or password".
6. `/dashboard` without a session redirects to `/login`.
