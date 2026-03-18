# TrikeTrack — Step-by-step (React Native + TypeScript)

Below is the **first implementation only** for the 3 authentication pages from your design:
- Log in
- Create Account
- Forgot Password

## 1) Create project

```bash
npx create-expo-app@latest triketrack-app --template blank-typescript
cd triketrack-app
npm install
npm run start
```

## 2) Replace `App.tsx` with the auth UI code

- Open `App.tsx`
- Paste the current implementation from this repository (the one in `triketrack-app/App.tsx`)

What this code includes:
1. `Screen` type with 3 page values.
2. Reusable `InputField` component.
3. Reusable `SocialRow` component.
4. Local state to switch between pages.
5. Styling close to your provided mockup.

## 3) Verify this first milestone

Run:

```bash
npx tsc --noEmit
```

Then launch on device/simulator:

```bash
npm run android
# or
npm run ios
```

## 4) How to navigate between the 3 pages

- **Login → Forgot Password**: tap `Forgot Password`
- **Login → Create Account**: tap `Sign Up here`
- **Create Account → Login**: tap `Sign In here`
- **Back button** (top-left): returns to Login

## 5) Suggested next step (after these 3 pages)

1. Install React Navigation.
2. Move each page into separate files:
   - `src/screens/LoginScreen.tsx`
   - `src/screens/CreateAccountScreen.tsx`
   - `src/screens/ForgotPasswordScreen.tsx`
3. Add validation (email format, password length, matching confirm password).
4. Connect buttons to your backend APIs.
