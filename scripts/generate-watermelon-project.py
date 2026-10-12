#!/usr/bin/env python3
"""Generate the dependency-free Xcode project from the native source tree."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "ios" / "Watermelon"
objects = {}


class Ref(str):
    pass


def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()


def obj(object_key, isa, **fields):
    key = uid(object_key)
    objects[key] = {"isa": isa, **fields}
    return Ref(key)


def serialize(value, level=0):
    if isinstance(value, Ref):
        return str(value)
    if isinstance(value, dict):
        return "{\n" + "".join("\t" * (level + 1) + json.dumps(k) + " = " + serialize(v, level + 1) + ";\n" for k, v in value.items()) + "\t" * level + "}"
    if isinstance(value, list):
        return "(" + ", ".join(serialize(v, level) for v in value) + ")"
    if isinstance(value, int):
        return str(value)
    return json.dumps(value)


app_target = Ref(uid("target:Watermelon"))
products = []
groups = []
targets = []
for target, product_type in [("Watermelon", "application"), ("WatermelonTests", "bundle.unit-test"), ("WatermelonUITests", "bundle.ui-testing")]:
    file_refs, sources, resources = [], [], []
    for file in sorted((root / target).iterdir()):
        if file.name.endswith(".lproj"):
            continue
        if file.suffix == ".swift":
            file_type = "sourcecode.swift"
        elif file.suffix == ".xcassets":
            file_type = "folder.assetcatalog"
        elif file.suffix in [".plist", ".xcprivacy"]:
            file_type = "text.plist.xml"
        else:
            file_type = "text.json"
        reference = obj("file:" + target + "/" + file.name, "PBXFileReference", lastKnownFileType=file_type, path=file.name, sourceTree="<group>")
        file_refs.append(reference)
        if file.suffix == ".swift":
            sources.append(obj("build:" + target + "/" + file.name, "PBXBuildFile", fileRef=reference))
        elif file.name != "Info.plist":
            resources.append(obj("build:" + target + "/" + file.name, "PBXBuildFile", fileRef=reference))
    for resource_name in ["Localizable.strings", "InfoPlist.strings"]:
        localized = []
        for folder in sorted((root / target).glob("*.lproj")):
            if not (folder / resource_name).exists():
                continue
            localized.append(obj("file:" + target + "/" + folder.name + "/" + resource_name, "PBXFileReference", lastKnownFileType="text.plist.strings", name=folder.stem, path=folder.name + "/" + resource_name, sourceTree="<group>"))
        if localized:
            group = obj("variant:" + resource_name, "PBXVariantGroup", children=localized, name=resource_name, sourceTree="<group>")
            file_refs.append(group)
            resources.append(obj("build:" + resource_name, "PBXBuildFile", fileRef=group))
    groups.append(obj("group:" + target, "PBXGroup", children=file_refs, path=target, sourceTree="<group>"))
    extension = ".app" if target == "Watermelon" else ".xctest"
    product = obj("product:" + target, "PBXFileReference", explicitFileType="wrapper.application" if extension == ".app" else "wrapper.cfbundle", includeInIndex=0, path=target + extension, sourceTree="BUILT_PRODUCTS_DIR")
    products.append(product)
    phases = [obj("sources:" + target, "PBXSourcesBuildPhase", buildActionMask=2147483647, files=sources, runOnlyForDeploymentPostprocessing=0),
              obj("frameworks:" + target, "PBXFrameworksBuildPhase", buildActionMask=2147483647, files=[], runOnlyForDeploymentPostprocessing=0),
              obj("resources:" + target, "PBXResourcesBuildPhase", buildActionMask=2147483647, files=resources, runOnlyForDeploymentPostprocessing=0)]
    configs = []
    for name in ["Debug", "Release"]:
        settings = {"SDKROOT": "iphoneos", "IPHONEOS_DEPLOYMENT_TARGET": "17.0", "SWIFT_VERSION": "5.0", "TARGETED_DEVICE_FAMILY": "1,2",
                    "PRODUCT_NAME": "$(TARGET_NAME)", "CODE_SIGN_STYLE": "Automatic", "CURRENT_PROJECT_VERSION": "1", "MARKETING_VERSION": "0.1.0",
                    "PRODUCT_BUNDLE_IDENTIFIER": "pt.watermelonexperiences.app" + ("." + target if target != "Watermelon" else ""),
                    "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks @loader_path/Frameworks",
                    "SWIFT_OPTIMIZATION_LEVEL": "-Onone" if name == "Debug" else "-O", "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG" if name == "Debug" else "",
                    "SWIFT_EMIT_LOC_STRINGS": "YES", "GENERATE_INFOPLIST_FILE": "NO" if target == "Watermelon" else "YES",
                    "ENABLE_TESTABILITY": "YES" if name == "Debug" else "NO", "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator"}
        if target == "Watermelon":
            settings.update({"INFOPLIST_FILE": "Watermelon/Info.plist", "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon", "SUPPORTS_MACCATALYST": "NO"})
        elif target == "WatermelonTests":
            settings.update({"TEST_HOST": "$(BUILT_PRODUCTS_DIR)/Watermelon.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Watermelon", "BUNDLE_LOADER": "$(TEST_HOST)"})
        else:
            settings["TEST_TARGET_NAME"] = "Watermelon"
        configs.append(obj("config:" + target + ":" + name, "XCBuildConfiguration", name=name, buildSettings=settings))
    config_list = obj("configs:" + target, "XCConfigurationList", buildConfigurations=configs, defaultConfigurationIsVisible=0, defaultConfigurationName="Release")
    dependencies = []
    if target != "Watermelon":
        proxy = obj("proxy:" + target, "PBXContainerItemProxy", containerPortal=Ref(uid("project")), proxyType=1, remoteGlobalIDString=app_target, remoteInfo="Watermelon")
        dependencies.append(obj("dependency:" + target, "PBXTargetDependency", target=app_target, targetProxy=proxy))
    targets.append(obj("target:" + target, "PBXNativeTarget", buildConfigurationList=config_list, buildPhases=phases, buildRules=[], dependencies=dependencies, name=target, productName=target, productReference=product, productType="com.apple.product-type." + product_type))

groups.append(obj("group:Products", "PBXGroup", children=products, name="Products", sourceTree="<group>"))
main_group = obj("group:main", "PBXGroup", children=groups, sourceTree="<group>")
project_configs = []
for name in ["Debug", "Release"]:
    project_configs.append(obj("project:config:" + name, "XCBuildConfiguration", name=name, buildSettings={"CLANG_ENABLE_MODULES": "YES", "CLANG_ENABLE_OBJC_ARC": "YES", "DEBUG_INFORMATION_FORMAT": "dwarf" if name == "Debug" else "dwarf-with-dsym", "GCC_C_LANGUAGE_STANDARD": "gnu17", "SWIFT_STRICT_CONCURRENCY": "minimal"}))
project_config_list = obj("project:configs", "XCConfigurationList", buildConfigurations=project_configs, defaultConfigurationIsVisible=0, defaultConfigurationName="Release")
project = obj("project", "PBXProject", attributes={"LastUpgradeCheck": "2600", "BuildIndependentTargetsInParallel": "YES", "TargetAttributes": {str(t): {"CreatedOnToolsVersion": "26.0"} for t in targets}}, buildConfigurationList=project_config_list, compatibilityVersion="Xcode 14.0", developmentRegion="en", hasScannedForEncodings=0, knownRegions=["en", "pt-PT", "Base"], mainGroup=main_group, productRefGroup=groups[-1], projectDirPath="", projectRoot="", targets=targets)

project_dir = root / "Watermelon.xcodeproj"
project_dir.mkdir(exist_ok=True)
(project_dir / "project.pbxproj").write_text("// !$*UTF8*$!\n" + serialize({"archiveVersion": 1, "classes": {}, "objectVersion": 56, "objects": objects, "rootObject": project}) + "\n")
scheme_dir = project_dir / "xcshareddata" / "xcschemes"
scheme_dir.mkdir(parents=True, exist_ok=True)


def buildable(target):
    suffix = ".app" if target == "Watermelon" else ".xctest"
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid("target:" + target)}" BuildableName="{target}{suffix}" BlueprintName="{target}" ReferencedContainer="container:Watermelon.xcodeproj" />'


scheme = '<?xml version="1.0" encoding="UTF-8"?>\n<Scheme LastUpgradeVersion="2600" version="1.3">'
scheme += '<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>'
for target in ["Watermelon", "WatermelonTests", "WatermelonUITests"]:
    scheme += '<BuildActionEntry buildForTesting="YES" buildForRunning="' + ("YES" if target == "Watermelon" else "NO") + '" buildForProfiling="NO" buildForArchiving="' + ("YES" if target == "Watermelon" else "NO") + '" buildForAnalyzing="YES">' + buildable(target) + '</BuildActionEntry>'
scheme += '</BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables>'
for target in ["WatermelonTests", "WatermelonUITests"]:
    scheme += '<TestableReference skipped="NO" parallelizable="NO">' + buildable(target) + '</TestableReference>'
scheme += '</Testables></TestAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">' + buildable("Watermelon") + '</BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">' + buildable("Watermelon") + '</BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>\n'
(scheme_dir / "Watermelon.xcscheme").write_text(scheme)
print(f"Generated {len(objects)} Xcode objects and shared scheme.")
