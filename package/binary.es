/*
 	binary.files - Files needed for the binary installation 

 	Copyright (c) Embedthis Software LLC, 2003-2011. All Rights Reserved.
 */

var top = App.dir.findAbove("configure").dirname

load(top.join("package/copy.es"))
var bare: Boolean = App.args[3] == "1"
var options = copySetup({task: App.args[1], root: Path(App.args[2])})
var build = options.build
var os = build.BLD_HOST_OS
var product = build.BLD_PRODUCT

/*
    Sources
 */
var sout: Path = build.BLD_OUT_DIR
var sbin: Path = build.BLD_BIN_DIR
var sinc: Path = build.BLD_INC_DIR
var slib: Path = build.BLD_LIB_DIR

/*
    Destinations
 */
var root: Path = build.BLD_ROOT_PREFIX
var bin: Path = build.BLD_BIN_PREFIX
var inc: Path = build.BLD_INC_PREFIX
var lib: Path = build.BLD_LIB_PREFIX
var ver: Path = build.BLD_VER_PREFIX
var cfg: Path = build.BLD_CFG_PREFIX
var log: Path = build.BLD_LOG_PREFIX
var man: Path = build.BLD_MAN_PREFIX
var spl: Path = build.BLD_SPL_PREFIX
var web: Path = build.BLD_WEB_PREFIX
var ssl: Path = cfg.join("ssl")
var etc: Path = root.join("etc")
var init: Path = etc.join("init.d")

bin.makeDir()
inc.makeDir()
lib.makeDir()
ver.makeDir()
cfg.makeDir()
cfg.join("config").makeDir()
spl.join("cache").makeDir()
web.makeDir()
if (!bare) {
    man.join("man1").makeDir()
    lib.join("www").makeDir()
    cfg.join("ssl").makeDir()
}

var saveLink 
if (options.task == "Remove" && bin.join("linkup").exists) {
    saveLink = Path(".").temp()
    bin.join("linkup").copy(saveLink)
    saveLink.attributes = {permissions: 0755}
}

cfg.makeDir()

copy("appweb*", bin, {from: sbin, permissions: 0755, strip: true})

if (!bare) {
    copy("LICENSE.TXT", ver, { from: "doc/licenses", fold: true, expand: true })
    copy("*.TXT", ver, { from: "doc/product", fold: true, expand: true })
    copy("uninstall.sh", bin.join("uninstall"), {from: "package", permissions: 0755, expand: true})
    copy("linkup", bin.join("linkup"), {from: "package", permissions: 0755, expand: true})

    let cmdFilter
    if (Config.OS == "WIN") {
        cmdFilter = /\.cmd/
    } else if (Config.OS == "MACOSX") {
        cmdFilter = /angel/
    } else {
        cmdFilter = /undefined/
    }
    copy("*", bin, {
        from: sbin,
        include: /angel|esp|http|sqlite|auth|makerom/
        exclude: cmdFilter,
        permissions: 0755,
    })
    log.makeDir()
    log.join("error.log").write("")

    copy("server.*", ssl, {from: "src/server/ssl"})

    copy("*", web, {
        from: "src/server/web",
        exclude: /mgmt\//,
    })

    copy("*", inc, {
        from: sinc,
        exclude: /appwebMonitor.h|buildConfig.h|testAppweb.h/,
    })

} else {
    copy("src/server/web/min-index.html", web.join("appweb.html"))
}

/*
    Copy libraries and symlink to sonames
 */
copy("*" + build.BLD_SHOBJ, lib, {from: slib, permissions: 0755, strip: true})
if (options.task != "Remove" && build.BLD_FEATURE_SSL == 1 && os == "LINUX") {
    copy("*" + build.BLD_SHOBJ + ".*", lib, {from: slib, permissions: 0755, strip: true})
    for each (f in slib.find("*.so.*")) {
        let withver = f.basename
        let nover = withver.name.replace(/\.[0-9]*.*/, ".so")
        Cmd.sh("rm -f " + lib.join(nover))
        Cmd.sh("ln -s " + withver + " " + lib.join(nover))
    }
}

copy("*", cfg, {
    from: "src/server",
    include: /mime.types|\.db$|appweb.conf|php.ini/,
    permissions: 0644
})

copy("*", lib, {
    from: slib,
    include: /esp.conf|esp-www/,
    permissions: 0644,
    recurse: true,
})

if (options.task != "Remove") {
    /*
        Patch appweb.conf
     */
    Cmd.sh("BLD_HTTP_PORT=" + build.BLD_HTTP_PORT + " BLD_SSL_PORT=" + build.BLD_SSL_PORT + " BLD_SPL_PREFIX=" + build.BLD_SPL_PREFIX + " " +
        "patchAppwebConf \"" + cfg.join("appweb.conf") + "\"")
}

if (build.BLD_FEATURE_EJSCRIPT == 1) {
    // copy("ejs*", bin, {from: sbin, permissions: 0755, strip: true})
    copy("ejs*.mod", lib, {from: slib})
}

/*
    Service startup scripts
 */
if (!bare) {
    if (os == "MACOSX") {
        let daemons = root.join("Library/LaunchDaemons")
        daemons.makeDir()
        copy("com.embedthis.appweb.plist", daemons, {from: "package/MACOSX", permissions: 0644, expand: true})

    } else if (os == "LINUX") {
        init.makeDir()
        if (options.task == "Package") {
            copy("package/LINUX/" + product + ".init", init.join(product), {permission: 0755, expand: true})
        } else {
            if (App.uid == 0 && options.root != "") {
                if (options.openwrt) {
                    root.join("CONTROL").makeDir()
                    copy("p*", root.join("CONTROL"), {from: "package/LINUX/deb.bin", permissions: 0755, expand: true})
                    copy("appweb.openwrt", init.join(product), {from: "package/LINUX", permissions: 0755, expand: true})
                } else {
                    /*
                     	Daemon start / stop scripts
                     */
                    copy("appweb.init", init.join(product), 
                        {from: "package/LINUX", permissions: 0755, expand: true, trace: true})

                    for each (i in [2, 3, 4, 5]) {
                        let level = ".d/S81"
                        etc.join("rc" + i + level + product).remove()
                        if (options.task != "Remove") {
                            etc.join("rc" + i + level).makeDir()
                            Cmd.sh("rm -f " + etc.join("rc" + i + level + product))
                            Cmd.sh("ln -s " + init.join(product) + " " + etc.join("rc" + i + level + product))
                        }
                    }
                    for each (i in [0, 1, 6]) {
                        let level = ".d/K15"
                        etc.join("rc" + i + level + product).remove()
                        if (options.task != "Remove") {
                            etc.join("rc" + i + level).makeDir()
                            Cmd.sh("rm -f " + etc.join("rc" + i + level + product))
                            Cmd.sh("ln -s " + init.join(product) + " " + etc.join("rc" + i + level + product))
                        }
                    }
                }
            }
        }
    }

    if (build.BLD_HOST_OS == "WIN") {
        if (build.BLD_CC_CL_VERSION == 16) {
            copy("msvcrt.lib", bin, {from: build.BLD_VS})
            copy("msvcr100.dll", bin, {from: build.BLD_VS.parent.join("redist/x86/Microsoft.VC100.CRT")})
        }
        copy("removeFiles*", bin, {from: sbin, permissions: 0755})
        copy("patchConfig.es", bin, {from: "package/wIN"})
    }
}

if (build.BLD_UNIX_LIKE == 1) {
    copy("*.1", man.join("man1"), {from: "doc/man", compress: true })
}

if (options.task == "Install") {
    if (!bare) {
        Cmd.sh(bin.join("linkup") + " " + options.task + " " + options.root)
    }
} else if (saveLink && saveLink.exists) {
    Cmd.sh(saveLink + " " + options.task + " " + options.root)
    saveLink.remove()
}
