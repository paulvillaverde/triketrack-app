package com.triketrack.driver.twa;

import android.net.Uri;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

public class MainActivity extends LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        return Uri.parse(getString(R.string.twa_default_url));
    }
}
