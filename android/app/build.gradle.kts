import java.util.Properties
import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { stream ->
        localProperties.load(stream)
    }
}

fun readConfigValue(name: String, fallback: String): String {
    val localValue = localProperties.getProperty(name)?.trim()
    if (!localValue.isNullOrEmpty()) return localValue

    val envValue = System.getenv(name)?.trim()
    if (!envValue.isNullOrEmpty()) return envValue

    return fallback
}

val pwaUrl = readConfigValue(
    "PWA_URL",
    readConfigValue("PAPIFLIX_BASE_URL", "http://10.0.2.2:3000"),
)
val escapedPwaUrl = pwaUrl
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")
val pwaUri = runCatching { URI(pwaUrl) }.getOrNull()
val pwaUrlScheme = pwaUri?.scheme?.takeIf { it.isNotBlank() } ?: "https"
val pwaUrlHost = pwaUri?.host?.takeIf { it.isNotBlank() } ?: "app.example.test"

android {
    namespace = "com.papiflix.app"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.papiflix.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "PWA_URL", "\"$escapedPwaUrl\"")
        manifestPlaceholders["pwaUrlScheme"] = pwaUrlScheme
        manifestPlaceholders["pwaUrlHost"] = pwaUrlHost
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        buildConfig = true
        compose = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
