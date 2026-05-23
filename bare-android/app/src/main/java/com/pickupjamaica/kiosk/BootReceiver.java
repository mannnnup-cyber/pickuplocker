package com.pickupjamaica.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Auto-starts the Pickup Kiosk app when the device boots.
 * Requires RECEIVE_BOOT_COMPLETED permission in manifest.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "PickupKiosk";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && 
            (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) ||
             "android.intent.action.QUICKBOOT_POWERON".equals(intent.getAction()) ||
             "com.htc.intent.action.QUICKBOOT_POWERON".equals(intent.getAction()))) {
            
            Log.i(TAG, "Boot completed — launching Pickup Kiosk");
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launchIntent);
        }
    }
}
