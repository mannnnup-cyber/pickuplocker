module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/fs/promises [external] (fs/promises, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs/promises", () => require("fs/promises"));

module.exports = mod;
}),
"[project]/src/app/api/app-version/download/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs$2f$promises__$5b$external$5d$__$28$fs$2f$promises$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs/promises [external] (fs/promises, cjs)");
;
;
async function GET() {
    try {
        // Try to find the latest APK in the releases directory
        const fs = await __turbopack_context__.A("[externals]/fs [external] (fs, cjs, async loader)");
        const path = await __turbopack_context__.A("[externals]/path [external] (path, cjs, async loader)");
        // Read version config to know which file to serve
        let configPath;
        let config = {};
        try {
            configPath = path.join(process.cwd(), 'app-version.json');
            const raw = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(raw);
        } catch  {
        // No config file
        }
        // Look for APK files in common locations
        const searchDirs = [
            path.join(process.cwd(), 'releases'),
            path.join(process.cwd(), 'download'),
            '/home/z/my-project/releases',
            '/home/z/my-project/download'
        ];
        // Try version-specific filename first, then latest
        const version = config.version || '3.2';
        const filenames = [
            `PickupJamaica-kiosk-v${version}.apk`,
            'PickupJamaica-kiosk-latest.apk'
        ];
        // Also scan for any APK sorted by modification time
        for (const dir of searchDirs){
            try {
                if (!fs.existsSync(dir)) continue;
                // Try specific filenames first
                for (const fname of filenames){
                    const fullPath = path.join(dir, fname);
                    if (fs.existsSync(fullPath)) {
                        const buffer = await (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs$2f$promises__$5b$external$5d$__$28$fs$2f$promises$2c$__cjs$29$__["readFile"])(fullPath);
                        return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](buffer, {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/vnd.android.package-archive',
                                'Content-Disposition': `attachment; filename="${fname}"`,
                                'Content-Length': buffer.length.toString(),
                                'Cache-Control': 'no-cache, no-store, must-revalidate'
                            }
                        });
                    }
                }
                // Fall back to most recent APK in the directory
                const files = fs.readdirSync(dir).filter((f)=>f.endsWith('.apk')).map((f)=>({
                        name: f,
                        path: path.join(dir, f),
                        mtime: fs.statSync(path.join(dir, f)).mtime.getTime()
                    })).sort((a, b)=>b.mtime - a.mtime);
                if (files.length > 0) {
                    const latest = files[0];
                    const buffer = await (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs$2f$promises__$5b$external$5d$__$28$fs$2f$promises$2c$__cjs$29$__["readFile"])(latest.path);
                    return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](buffer, {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/vnd.android.package-archive',
                            'Content-Disposition': `attachment; filename="${latest.name}"`,
                            'Content-Length': buffer.length.toString(),
                            'Cache-Control': 'no-cache, no-store, must-revalidate'
                        }
                    });
                }
            } catch  {
                continue;
            }
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'No APK file found. Upload an APK to the releases directory.'
        }, {
            status: 404
        });
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Failed to serve APK file'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1f78d2bd._.js.map