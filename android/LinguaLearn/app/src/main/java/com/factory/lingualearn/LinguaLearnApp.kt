package com.factory.lingualearn

import android.app.Application
import android.content.Context

class LinguaLearnApp : Application() {

    companion object {
        lateinit var appContext: Context
            private set
    }

    override fun onCreate() {
        super.onCreate()
        appContext = applicationContext
    }
}
