# Paper Wings Development Loop

Paper Wings uses an EAS development client on Sam's registered iPhone. The
normal loop does not require a cable, iPhone Mirroring, or a working local
Xcode/CoreDevice installation.

## One-time device setup

1. Confirm the Expo account and project:

   ```sh
   eas whoami
   eas project:info
   ```

2. Register the iPhone:

   ```sh
   eas device:create
   ```

   Open the generated registration link on the iPhone and complete the Apple
   profile installation. This registration must happen before the build so the
   device UDID is included in the ad hoc provisioning profile.

3. Check the Expo account's current EAS Build usage before starting a build.
   The Free plan currently includes up to 15 iOS builds per calendar month. If
   the next build would exceed the included quota or create any charge, stop
   and add an `ASK-SAM` item with the exact cost before proceeding.

4. Create the physical-device development build:

   ```sh
   eas build --profile dev --platform ios
   ```

   Use Expo-managed credentials already associated with Sam's Expo and Apple
   accounts. If EAS requests an Expo login, Apple login, two-factor code,
   certificate decision, or signing decision, stop and hand that prompt to Sam
   through `ASK-SAM`. Never save credentials, recovery codes, or secrets in the
   repo, Obsidian, terminal transcripts, or chat.

5. Open the EAS install link on the registered iPhone and install Paper Wings.
   On iOS 16 or newer, enable Developer Mode if iOS requests it.

## Everyday Wi-Fi loop

With the Mac and iPhone on the same Wi-Fi network:

```sh
npx expo start --dev-client --lan
```

Open Paper Wings on the iPhone and select the development server. JavaScript,
TypeScript, content, and bundled asset edits reload through Metro without a new
EAS build.

When the phone is away from the Mac's local network, use a tunnel instead:

```sh
npx expo start --dev-client --tunnel
```

Keep the Metro process and Mac awake while testing. A development client still
needs Metro; the EAS install only removes the cable and local Xcode dependency.

## When a new EAS build is required

Create another `dev` build only when the native runtime changes, including:

- adding, removing, or upgrading a native dependency
- changing an Expo config plugin
- changing iOS entitlements, permissions, bundle identifier, or native config
- upgrading Expo SDK or React Native
- registering another iPhone that is not in the current provisioning profile

Before every build, repeat the free-tier usage check. Commit and push native
configuration changes before launching the build so the build maps to GitHub.

## Deferred and non-destructive work

- `ASK-SAM`: local Xcode/CoreDevice repair is optional and deferred. It is not
  on the Paper Wings development critical path.
- Android emulator cleanup must be non-destructive. Stop stale emulator or ADB
  processes when they are unused, but never wipe an AVD, delete emulator data,
  remove SDK files, or erase user files without Sam's explicit instruction.
