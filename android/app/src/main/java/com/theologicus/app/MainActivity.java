package com.theologicus.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    /* IMPORTANT : enregistrer AVANT super.onCreate() — BridgeActivity.load()
       (appele par super.onCreate) construit le bridge avec la liste des
       plugins connus a cet instant ; un enregistrement apres coup est
       ignore (c'etait la cause du plugin inexistant en v1.0.26). */
    registerPlugin(SavePickerPlugin.class);
    registerPlugin(SpeechBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
