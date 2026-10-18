/**
 * After Effects MCP ExtendScript Host Bridge
 * Compatible with Adobe After Effects CC 2018 (v15.x) through CC 2025+
 */

/* global app, File, Folder, CompItem, FootageItem, FolderItem, ImportOptions, BlendingMode, KeyframeInterpolationType, $ */

if (typeof $._AfterEffectsMCP_ === "undefined") {
  $._AfterEffectsMCP_ = {};
}

(function () {
  "use strict";

  // ==========================================
  // ES3 JSON Polyfill for ExtendScript
  // ==========================================
  var JSON = (function () {
    var rx_escapable = /[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    var meta = {
      "\b": "\\b",
      "\t": "\\t",
      "\n": "\\n",
      "\f": "\\f",
      "\r": "\\r",
      '"': '\\"',
      "\\": "\\\\"
    };

    function quote(string) {
      rx_escapable.lastIndex = 0;
      return rx_escapable.test(string)
        ? '"' +
            string.replace(rx_escapable, function (a) {
              var c = meta[a];
              return typeof c === "string"
                ? c
                : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
            }) +
            '"'
        : '"' + string + '"';
    }

    function str(key, holder) {
      var value = holder[key];
      if (value === null || value === undefined) return "null";
      var t = typeof value;
      if (t === "string") return quote(value);
      if (t === "number") return isFinite(value) ? String(value) : "null";
      if (t === "boolean") return String(value);
      if (t === "object") {
        if (value instanceof Array) {
          var length = value.length;
          var partial = [];
          for (var i = 0; i < length; i += 1) {
            partial[i] = str(i, value) || "null";
          }
          return "[" + partial.join(",") + "]";
        }
        var partialObj = [];
        for (var k in value) {
          if (Object.prototype.hasOwnProperty.call(value, k)) {
            var v = str(k, value);
            if (v) {
              partialObj.push(quote(k) + ":" + v);
            }
          }
        }
        return "{" + partialObj.join(",") + "}";
      }
      return "null";
    }

    return {
      stringify: function (value) {
        return str("", { "": value });
      },
      parse: function (text) {
        return eval("(" + text + ")");
      }
    };
  })();

  // ==========================================
  // Helper Utilities
  // ==========================================
  function wrapSuccess(result) {
    return JSON.stringify({ ok: true, result: result });
  }

  function wrapError(message, code, details) {
    return JSON.stringify({
      ok: false,
      error: String(message),
      code: code || "EXTENDSCRIPT_ERROR",
      details: details || null
    });
  }

  function findComp(compId, compName) {
    if (!app.project) return null;
    if (compId) {
      for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof CompItem && it.id === Number(compId)) {
          return it;
        }
      }
    }
    if (compName) {
      for (var j = 1; j <= app.project.numItems; j++) {
        var itm = app.project.item(j);
        if (itm instanceof CompItem && itm.name === compName) {
          return itm;
        }
      }
    }
    if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
      return app.project.activeItem;
    }
    for (var k = 1; k <= app.project.numItems; k++) {
      var firstComp = app.project.item(k);
      if (firstComp instanceof CompItem) {
        return firstComp;
      }
    }
    return null;
  }

  function findLayer(comp, layerIndex, layerName) {
    if (!comp) return null;
    if (layerIndex !== undefined && layerIndex !== null) {
      var idx = Number(layerIndex);
      if (idx >= 1 && idx <= comp.numLayers) {
        return comp.layer(idx);
      }
    }
    if (layerName) {
      for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === layerName) {
          return comp.layer(i);
        }
      }
    }
    return null;
  }

  function getBlendingModeEnum(modeStr) {
    if (!modeStr) return BlendingMode.NORMAL;
    var upper = modeStr.toUpperCase().replace(/\s+/g, "");
    switch (upper) {
      case "NORMAL": return BlendingMode.NORMAL;
      case "DISSOLVE": return BlendingMode.DISSOLVE;
      case "DARKEN": return BlendingMode.DARKEN;
      case "MULTIPLY": return BlendingMode.MULTIPLY;
      case "COLORBURN": return BlendingMode.COLOR_BURN;
      case "LINEARBURN": return BlendingMode.LINEAR_BURN;
      case "DARKERCOLOR": return BlendingMode.DARKER_COLOR;
      case "ADD": return BlendingMode.ADD;
      case "LIGHTEN": return BlendingMode.LIGHTEN;
      case "SCREEN": return BlendingMode.SCREEN;
      case "COLORDODGE": return BlendingMode.COLOR_DODGE;
      case "LINEARDODGE": return BlendingMode.LINEAR_DODGE;
      case "LIGHTERCOLOR": return BlendingMode.LIGHTER_COLOR;
      case "OVERLAY": return BlendingMode.OVERLAY;
      case "SOFTLIGHT": return BlendingMode.SOFT_LIGHT;
      case "HARDLIGHT": return BlendingMode.HARD_LIGHT;
      case "VIVIDLIGHT": return BlendingMode.VIVID_LIGHT;
      case "LINEARLIGHT": return BlendingMode.LINEAR_LIGHT;
      case "PINLIGHT": return BlendingMode.PIN_LIGHT;
      case "HARDMIX": return BlendingMode.HARD_MIX;
      case "DIFFERENCE": return BlendingMode.DIFFERENCE;
      case "EXCLUSION": return BlendingMode.EXCLUSION;
      case "SUBTRACT": return BlendingMode.SUBTRACT;
      case "DIVIDE": return BlendingMode.DIVIDE;
      case "HUE": return BlendingMode.HUE;
      case "SATURATION": return BlendingMode.SATURATION;
      case "COLOR": return BlendingMode.COLOR;
      case "LUMINOSITY": return BlendingMode.LUMINOSITY;
      case "STENCILALPHA": return BlendingMode.STENCIL_ALPHA;
      case "STENCILLUMA": return BlendingMode.STENCIL_LUMA;
      case "SILHOUETTEALPHA": return BlendingMode.SILHOUETTE_ALPHA;
      case "SILHOUETTELUMA": return BlendingMode.SILHOUETTE_LUMA;
      case "ALPHAADD": return BlendingMode.ALPHA_ADD;
      case "LUMINESCENTPREMUL": return BlendingMode.LUMINESCENT_PREMUL;
      default: return BlendingMode.NORMAL;
    }
  }

  function getBlendingModeName(enumVal) {
    switch (enumVal) {
      case BlendingMode.NORMAL: return "Normal";
      case BlendingMode.MULTIPLY: return "Multiply";
      case BlendingMode.SCREEN: return "Screen";
      case BlendingMode.OVERLAY: return "Overlay";
      case BlendingMode.ADD: return "Add";
      case BlendingMode.LIGHTEN: return "Lighten";
      case BlendingMode.DARKEN: return "Darken";
      case BlendingMode.COLOR_DODGE: return "Color Dodge";
      case BlendingMode.COLOR_BURN: return "Color Burn";
      case BlendingMode.HARD_LIGHT: return "Hard Light";
      case BlendingMode.SOFT_LIGHT: return "Soft Light";
      case BlendingMode.DIFFERENCE: return "Difference";
      case BlendingMode.EXCLUSION: return "Exclusion";
      case BlendingMode.HUE: return "Hue";
      case BlendingMode.SATURATION: return "Saturation";
      case BlendingMode.COLOR: return "Color";
      case BlendingMode.LUMINOSITY: return "Luminosity";
      default: return "Normal";
    }
  }

  // ==========================================
  // Public Methods
  // ==========================================

  $._AfterEffectsMCP_.readBridgeState = function (filePath) {
    try {
      var f = new File(filePath);
      if (!f.exists) {
        return wrapError("State file does not exist: " + filePath, "FILE_NOT_FOUND");
      }
      f.open("r");
      var content = f.read();
      f.close();
      var parsed = JSON.parse(content);
      return wrapSuccess(parsed);
    } catch (e) {
      return wrapError(e.message, "FILE_READ_ERROR");
    }
  };

  $._AfterEffectsMCP_.getHostStatus = function () {
    try {
      var projectOpen = Boolean(app.project);
      var projectName = "";
      var projectPath = "";
      var activeCompName = "";

      if (projectOpen) {
        if (app.project.file) {
          projectName = app.project.file.name;
          projectPath = app.project.file.fsName;
        } else {
          projectName = "Untitled Project";
        }
        if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
          activeCompName = app.project.activeItem.name;
        }
      }

      return wrapSuccess({
        hostVersion: app.version,
        projectOpen: projectOpen,
        projectName: projectName,
        projectPath: projectPath,
        activeComp: activeCompName
      });
    } catch (e) {
      return wrapError(e.message, "GET_HOST_STATUS_ERROR");
    }
  };

  // ==========================================
  // Command Dispatcher
  // ==========================================
  $._AfterEffectsMCP_.dispatch = function (cmdString) {
    try {
      var cmd = JSON.parse(cmdString);
      var action = cmd.action;
      var params = cmd.params || {};

      switch (action) {
        case "ae_ping":
          return wrapSuccess({ pong: true, time: new Date().toString(), appVersion: app.version });

        case "ae_health_check": {
          var pOpen = Boolean(app.project);
          var activeComp = pOpen && app.project.activeItem instanceof CompItem ? app.project.activeItem.name : null;
          return wrapSuccess({
            appVersion: app.version,
            projectLoaded: pOpen,
            projectName: pOpen && app.project.file ? app.project.file.name : "Untitled",
            itemCount: pOpen ? app.project.numItems : 0,
            activeComp: activeComp
          });
        }

        case "get_project_info": {
          if (!app.project) return wrapError("No After Effects project is currently open.", "NO_PROJECT");
          var compCount = 0;
          var footageCount = 0;
          var folderCount = 0;
          for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) compCount++;
            else if (item instanceof FootageItem) footageCount++;
            else if (item instanceof FolderItem) folderCount++;
          }
          return wrapSuccess({
            projectName: app.project.file ? app.project.file.name : "Untitled",
            projectPath: app.project.file ? app.project.file.fsName : null,
            totalItems: app.project.numItems,
            compositionCount: compCount,
            footageCount: footageCount,
            folderCount: folderCount,
            bitsPerChannel: app.project.bitsPerChannel,
            displayStartFrame: app.project.displayStartFrame
          });
        }

        case "save_project": {
          if (!app.project) return wrapError("No project open to save.", "NO_PROJECT");
          if (params.destinationPath) {
            var destFile = new File(params.destinationPath);
            app.project.save(destFile);
            return wrapSuccess({ savedAs: destFile.fsName });
          } else {
            app.project.save();
            return wrapSuccess({ saved: app.project.file ? app.project.file.fsName : "Saved" });
          }
        }

        case "list_compositions": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          var comps = [];
          for (var ci = 1; ci <= app.project.numItems; ci++) {
            var cIt = app.project.item(ci);
            if (cIt instanceof CompItem) {
              comps.push({
                id: cIt.id,
                name: cIt.name,
                width: cIt.width,
                height: cIt.height,
                pixelAspect: cIt.pixelAspect,
                frameRate: cIt.frameRate,
                duration: cIt.duration,
                numLayers: cIt.numLayers
              });
            }
          }
          return wrapSuccess({ compositions: comps, total: comps.length });
        }

        case "get_active_composition": {
          var activeComp = findComp();
          if (!activeComp) return wrapError("No active composition found.", "NO_ACTIVE_COMP");
          return wrapSuccess({
            id: activeComp.id,
            name: activeComp.name,
            width: activeComp.width,
            height: activeComp.height,
            pixelAspect: activeComp.pixelAspect,
            frameRate: activeComp.frameRate,
            duration: activeComp.duration,
            numLayers: activeComp.numLayers,
            time: activeComp.time,
            bgColor: activeComp.bgColor
          });
        }

        case "create_composition": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          var name = params.name || "Comp 1";
          var w = params.width || 1920;
          var h = params.height || 1080;
          var par = params.pixelAspect || 1.0;
          var dur = params.duration || 30.0;
          var fps = params.frameRate || 30.0;

          var newComp = app.project.items.addComp(name, w, h, par, dur, fps);
          return wrapSuccess({
            id: newComp.id,
            name: newComp.name,
            width: newComp.width,
            height: newComp.height,
            pixelAspect: newComp.pixelAspect,
            duration: newComp.duration,
            frameRate: newComp.frameRate
          });
        }

        case "get_composition_settings": {
          var targetComp = findComp(params.compositionId, params.compositionName);
          if (!targetComp) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          return wrapSuccess({
            id: targetComp.id,
            name: targetComp.name,
            width: targetComp.width,
            height: targetComp.height,
            pixelAspect: targetComp.pixelAspect,
            duration: targetComp.duration,
            frameRate: targetComp.frameRate,
            numLayers: targetComp.numLayers,
            dropFrame: targetComp.dropFrame,
            workAreaStart: targetComp.workAreaStart,
            workAreaDuration: targetComp.workAreaDuration
          });
        }

        case "list_project_items": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          var items = [];
          var fType = params.filterType || "all";
          for (var pi = 1; pi <= app.project.numItems; pi++) {
            var pIt = app.project.item(pi);
            var typeStr = "unknown";
            if (pIt instanceof CompItem) typeStr = "composition";
            else if (pIt instanceof FolderItem) typeStr = "folder";
            else if (pIt instanceof FootageItem) {
              typeStr = (pIt.mainSource && pIt.mainSource.isSolid) ? "solid" : "footage";
            }

            if (fType === "all" || fType === typeStr) {
              items.push({
                id: pIt.id,
                name: pIt.name,
                type: typeStr,
                typeName: pIt.typeName,
                comment: pIt.comment
              });
            }
          }
          return wrapSuccess({ items: items, total: items.length });
        }

        case "import_media_to_project": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          var paths = params.filePaths || (params.filePath ? [params.filePath] : []);
          if (paths.length === 0) return wrapError("No file paths provided to import.", "NO_PATHS");

          var imported = [];
          for (var fi = 0; fi < paths.length; fi++) {
            var importFile = new File(paths[fi]);
            if (!importFile.exists) {
              return wrapError("File does not exist: " + paths[fi], "FILE_NOT_FOUND");
            }
            var opts = new ImportOptions(importFile);
            var footageItem = app.project.importFile(opts);
            imported.push({
              id: footageItem.id,
              name: footageItem.name,
              width: footageItem.width,
              height: footageItem.height,
              duration: footageItem.duration
            });
          }
          return wrapSuccess({ importedItems: imported, count: imported.length });
        }

        case "list_layers": {
          var comp = findComp(params.compositionId, params.compositionName);
          if (!comp) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var layers = [];
          for (var li = 1; li <= comp.numLayers; li++) {
            var ly = comp.layer(li);
            var layerType = "AVLayer";
            if (ly.matchName === "ADBE Text Layer") layerType = "TextLayer";
            else if (ly.matchName === "ADBE Camera Layer") layerType = "CameraLayer";
            else if (ly.matchName === "ADBE Light Layer") layerType = "LightLayer";
            else if (ly.matchName === "ADBE Vector Layer") layerType = "ShapeLayer";

            layers.push({
              index: ly.index,
              name: ly.name,
              type: layerType,
              enabled: ly.enabled,
              inPoint: ly.inPoint,
              outPoint: ly.outPoint,
              startTime: ly.startTime,
              duration: ly.outPoint - ly.inPoint,
              solo: ly.solo,
              locked: ly.locked,
              threeDLayer: ly.threeDLayer,
              blendingMode: getBlendingModeName(ly.blendingMode)
            });
          }
          return wrapSuccess({ compositionName: comp.name, layers: layers, totalLayers: layers.length });
        }

        case "get_layer_info": {
          var compForInfo = findComp(params.compositionId);
          if (!compForInfo) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var targetLayer = findLayer(compForInfo, params.layerIndex, params.layerName);
          if (!targetLayer) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var transform = {};
          try {
            if (targetLayer.transform.position) transform.position = targetLayer.transform.position.value;
            if (targetLayer.transform.scale) transform.scale = targetLayer.transform.scale.value;
            if (targetLayer.transform.rotation) transform.rotation = targetLayer.transform.rotation.value;
            if (targetLayer.transform.opacity) transform.opacity = targetLayer.transform.opacity.value;
            if (targetLayer.transform.anchorPoint) transform.anchorPoint = targetLayer.transform.anchorPoint.value;
          } catch (_transErr) {}

          var effectsList = [];
          try {
            var effGroup = targetLayer("Effects");
            if (effGroup) {
              for (var ei = 1; ei <= effGroup.numProperties; ei++) {
                var eff = effGroup.property(ei);
                effectsList.push({ index: ei, name: eff.name, matchName: eff.matchName });
              }
            }
          } catch (_effErr) {}

          return wrapSuccess({
            index: targetLayer.index,
            name: targetLayer.name,
            enabled: targetLayer.enabled,
            inPoint: targetLayer.inPoint,
            outPoint: targetLayer.outPoint,
            startTime: targetLayer.startTime,
            blendingMode: getBlendingModeName(targetLayer.blendingMode),
            threeDLayer: targetLayer.threeDLayer,
            transform: transform,
            effects: effectsList
          });
        }

        case "add_solid_layer": {
          var compSolid = findComp(params.compositionId);
          if (!compSolid) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var col = params.color || [1.0, 1.0, 1.0];
          var sName = params.name || "Solid";
          var sw = params.width || compSolid.width;
          var sh = params.height || compSolid.height;
          var spar = params.pixelAspect || compSolid.pixelAspect;
          var sdur = params.duration || compSolid.duration;

          var solidLayer = compSolid.layers.addSolid(col, sName, sw, sh, spar, sdur);
          return wrapSuccess({
            index: solidLayer.index,
            name: solidLayer.name,
            width: sw,
            height: sh,
            duration: sdur
          });
        }

        case "add_text_layer": {
          var compText = findComp(params.compositionId);
          if (!compText) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var textContent = params.text || "";
          var textLayer = compText.layers.addText(textContent);
          if (params.name) textLayer.name = params.name;
          if (params.position && params.position.length >= 2) {
            textLayer.transform.position.setValue(params.position);
          }
          return wrapSuccess({
            index: textLayer.index,
            name: textLayer.name,
            text: textContent
          });
        }

        case "add_media_layer": {
          var compMedia = findComp(params.compositionId);
          if (!compMedia) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var mediaItem = null;
          if (params.projectItemId) {
            for (var mii = 1; mii <= app.project.numItems; mii++) {
              if (app.project.item(mii).id === Number(params.projectItemId)) {
                mediaItem = app.project.item(mii);
                break;
              }
            }
          } else if (params.projectItemName) {
            for (var min = 1; min <= app.project.numItems; min++) {
              if (app.project.item(min).name === params.projectItemName) {
                mediaItem = app.project.item(min);
                break;
              }
            }
          }
          if (!mediaItem) return wrapError("Media item not found in project.", "MEDIA_NOT_FOUND");

          var mediaLayer = compMedia.layers.add(mediaItem);
          if (params.startTime !== undefined) {
            mediaLayer.startTime = Number(params.startTime);
          }
          return wrapSuccess({
            index: mediaLayer.index,
            name: mediaLayer.name,
            startTime: mediaLayer.startTime,
            inPoint: mediaLayer.inPoint,
            outPoint: mediaLayer.outPoint
          });
        }

        case "set_layer_transform": {
          var compTrans = findComp(params.compositionId);
          if (!compTrans) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lTrans = findLayer(compTrans, params.layerIndex, params.layerName);
          if (!lTrans) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          if (params.position !== undefined) lTrans.transform.position.setValue(params.position);
          if (params.scale !== undefined) lTrans.transform.scale.setValue(params.scale);
          if (params.rotation !== undefined) {
            if (lTrans.threeDLayer && lTrans.transform.zRotation) {
              lTrans.transform.zRotation.setValue(params.rotation);
            } else if (lTrans.transform.rotation) {
              lTrans.transform.rotation.setValue(params.rotation);
            }
          }
          if (params.opacity !== undefined) lTrans.transform.opacity.setValue(params.opacity);
          if (params.anchorPoint !== undefined) lTrans.transform.anchorPoint.setValue(params.anchorPoint);

          return wrapSuccess({
            index: lTrans.index,
            name: lTrans.name,
            position: lTrans.transform.position.value,
            scale: lTrans.transform.scale.value,
            opacity: lTrans.transform.opacity.value
          });
        }

        case "set_layer_opacity": {
          var compOp = findComp(params.compositionId);
          if (!compOp) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lOp = findLayer(compOp, params.layerIndex, params.layerName);
          if (!lOp) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var opacityVal = Number(params.opacity);
          lOp.transform.opacity.setValue(opacityVal);
          return wrapSuccess({ index: lOp.index, name: lOp.name, opacity: opacityVal });
        }

        case "set_layer_blending_mode": {
          var compBlend = findComp(params.compositionId);
          if (!compBlend) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lBlend = findLayer(compBlend, params.layerIndex, params.layerName);
          if (!lBlend) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var bm = getBlendingModeEnum(params.mode);
          lBlend.blendingMode = bm;
          return wrapSuccess({ index: lBlend.index, name: lBlend.name, mode: getBlendingModeName(lBlend.blendingMode) });
        }

        case "split_or_trim_layer": {
          var compTrim = findComp(params.compositionId);
          if (!compTrim) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lTrim = findLayer(compTrim, params.layerIndex, params.layerName);
          if (!lTrim) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          if (params.inPoint !== undefined) lTrim.inPoint = Number(params.inPoint);
          if (params.outPoint !== undefined) lTrim.outPoint = Number(params.outPoint);
          if (params.startTime !== undefined) lTrim.startTime = Number(params.startTime);

          var splitResult = null;
          if (params.splitAtTime !== undefined) {
            var splitT = Number(params.splitAtTime);
            var duplicateLayer = lTrim.duplicate();
            lTrim.outPoint = splitT;
            duplicateLayer.inPoint = splitT;
            splitResult = {
              firstHalf: { index: lTrim.index, inPoint: lTrim.inPoint, outPoint: lTrim.outPoint },
              secondHalf: { index: duplicateLayer.index, inPoint: duplicateLayer.inPoint, outPoint: duplicateLayer.outPoint }
            };
          }

          return wrapSuccess({
            index: lTrim.index,
            name: lTrim.name,
            inPoint: lTrim.inPoint,
            outPoint: lTrim.outPoint,
            split: splitResult
          });
        }

        case "remove_layer": {
          var compRem = findComp(params.compositionId);
          if (!compRem) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lRem = findLayer(compRem, params.layerIndex, params.layerName);
          if (!lRem) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var removedName = lRem.name;
          var removedIndex = lRem.index;
          lRem.remove();
          return wrapSuccess({ removed: true, layerIndex: removedIndex, layerName: removedName });
        }

        case "set_layer_enabled": {
          var compEn = findComp(params.compositionId);
          if (!compEn) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lEn = findLayer(compEn, params.layerIndex, params.layerName);
          if (!lEn) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          lEn.enabled = Boolean(params.enabled);
          return wrapSuccess({ index: lEn.index, name: lEn.name, enabled: lEn.enabled });
        }

        case "list_layer_effects": {
          var compEff = findComp(params.compositionId);
          if (!compEff) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lEff = findLayer(compEff, params.layerIndex, params.layerName);
          if (!lEff) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var fxList = [];
          var eg = lEff("Effects");
          if (eg) {
            for (var efi = 1; efi <= eg.numProperties; efi++) {
              var fx = eg.property(efi);
              var propNames = [];
              for (var fpi = 1; fpi <= fx.numProperties; fpi++) {
                propNames.push(fx.property(fpi).name);
              }
              fxList.push({ index: efi, name: fx.name, matchName: fx.matchName, properties: propNames });
            }
          }
          return wrapSuccess({ index: lEff.index, name: lEff.name, effects: fxList });
        }

        case "apply_effect": {
          var compAppFx = findComp(params.compositionId);
          if (!compAppFx) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lAppFx = findLayer(compAppFx, params.layerIndex, params.layerName);
          if (!lAppFx) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var effectName = params.effectMatchName;
          var effGroup2 = lAppFx("Effects");
          if (!effGroup2) {
            effGroup2 = lAppFx.property("ADBE Effect Parade");
          }
          var applied = effGroup2.addProperty(effectName);
          return wrapSuccess({
            layerIndex: lAppFx.index,
            effectName: applied.name,
            effectMatchName: applied.matchName
          });
        }

        case "set_effect_property": {
          var compSetFx = findComp(params.compositionId);
          if (!compSetFx) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lSetFx = findLayer(compSetFx, params.layerIndex, params.layerName);
          if (!lSetFx) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var fxPropGrp = lSetFx("Effects");
          var targetFx = fxPropGrp.property(params.effectIndexOrName);
          if (!targetFx) return wrapError("Effect not found on layer.", "EFFECT_NOT_FOUND");

          var targetProp = targetFx.property(params.propertyIndexOrName);
          if (!targetProp) return wrapError("Property not found on effect.", "PROPERTY_NOT_FOUND");

          targetProp.setValue(params.value);
          return wrapSuccess({
            effect: targetFx.name,
            property: targetProp.name,
            value: targetProp.value
          });
        }

        case "remove_effect": {
          var compRemFx = findComp(params.compositionId);
          if (!compRemFx) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lRemFx = findLayer(compRemFx, params.layerIndex, params.layerName);
          if (!lRemFx) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var targetRemFx = lRemFx("Effects").property(params.effectIndexOrName);
          if (!targetRemFx) return wrapError("Effect not found on layer.", "EFFECT_NOT_FOUND");

          var fxName = targetRemFx.name;
          targetRemFx.remove();
          return wrapSuccess({ removed: true, effectName: fxName });
        }

        case "list_supported_keyframe_properties": {
          var compKf = findComp(params.compositionId);
          if (!compKf) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lKf = findLayer(compKf, params.layerIndex, params.layerName);
          if (!lKf) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var kfProps = [
            { group: "Transform", name: "Position", canKeyframe: lKf.transform.position.canSetHoldValue },
            { group: "Transform", name: "Scale", canKeyframe: lKf.transform.scale.canSetHoldValue },
            { group: "Transform", name: "Rotation", canKeyframe: true },
            { group: "Transform", name: "Opacity", canKeyframe: lKf.transform.opacity.canSetHoldValue },
            { group: "Transform", name: "Anchor Point", canKeyframe: lKf.transform.anchorPoint.canSetHoldValue }
          ];
          return wrapSuccess({ layerIndex: lKf.index, layerName: lKf.name, properties: kfProps });
        }

        case "get_property_keyframes": {
          var compGetKf = findComp(params.compositionId);
          if (!compGetKf) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lGetKf = findLayer(compGetKf, params.layerIndex, params.layerName);
          if (!lGetKf) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var prop = null;
          var pName = params.propertyName;
          if (!params.propertyGroup || params.propertyGroup === "Transform") {
            if (pName.toLowerCase() === "position") prop = lGetKf.transform.position;
            else if (pName.toLowerCase() === "scale") prop = lGetKf.transform.scale;
            else if (pName.toLowerCase() === "opacity") prop = lGetKf.transform.opacity;
            else if (pName.toLowerCase() === "rotation") {
              prop = lGetKf.threeDLayer ? lGetKf.transform.zRotation : lGetKf.transform.rotation;
            } else if (pName.toLowerCase() === "anchorpoint") prop = lGetKf.transform.anchorPoint;
          } else {
            var fx = lGetKf("Effects").property(params.propertyGroup);
            if (fx) prop = fx.property(pName);
          }
          if (!prop) return wrapError("Property not found.", "PROPERTY_NOT_FOUND");

          var keys = [];
          for (var ki = 1; ki <= prop.numKeys; ki++) {
            keys.push({
              index: ki,
              time: prop.keyTime(ki),
              value: prop.keyValue(ki)
            });
          }
          return wrapSuccess({ propertyName: prop.name, numKeys: prop.numKeys, keyframes: keys });
        }

        case "add_property_keyframe": {
          var compAddKf = findComp(params.compositionId);
          if (!compAddKf) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lAddKf = findLayer(compAddKf, params.layerIndex, params.layerName);
          if (!lAddKf) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var propAdd = null;
          var pNameAdd = params.propertyName;
          if (!params.propertyGroup || params.propertyGroup === "Transform") {
            if (pNameAdd.toLowerCase() === "position") propAdd = lAddKf.transform.position;
            else if (pNameAdd.toLowerCase() === "scale") propAdd = lAddKf.transform.scale;
            else if (pNameAdd.toLowerCase() === "opacity") propAdd = lAddKf.transform.opacity;
            else if (pNameAdd.toLowerCase() === "rotation") {
              propAdd = lAddKf.threeDLayer ? lAddKf.transform.zRotation : lAddKf.transform.rotation;
            } else if (pNameAdd.toLowerCase() === "anchorpoint") propAdd = lAddKf.transform.anchorPoint;
          } else {
            var fxAdd = lAddKf("Effects").property(params.propertyGroup);
            if (fxAdd) propAdd = fxAdd.property(pNameAdd);
          }
          if (!propAdd) return wrapError("Property not found.", "PROPERTY_NOT_FOUND");

          propAdd.setValueAtTime(Number(params.time), params.value);
          return wrapSuccess({
            propertyName: propAdd.name,
            time: Number(params.time),
            value: params.value,
            numKeys: propAdd.numKeys
          });
        }

        case "remove_property_keyframe": {
          var compRemKf = findComp(params.compositionId);
          if (!compRemKf) return wrapError("Composition not found.", "COMP_NOT_FOUND");
          var lRemKf = findLayer(compRemKf, params.layerIndex, params.layerName);
          if (!lRemKf) return wrapError("Layer not found.", "LAYER_NOT_FOUND");

          var propRem = null;
          var pNameRem = params.propertyName;
          if (!params.propertyGroup || params.propertyGroup === "Transform") {
            if (pNameRem.toLowerCase() === "position") propRem = lRemKf.transform.position;
            else if (pNameRem.toLowerCase() === "scale") propRem = lRemKf.transform.scale;
            else if (pNameRem.toLowerCase() === "opacity") propRem = lRemKf.transform.opacity;
            else if (pNameRem.toLowerCase() === "rotation") {
              propRem = lRemKf.threeDLayer ? lRemKf.transform.zRotation : lRemKf.transform.rotation;
            } else if (pNameRem.toLowerCase() === "anchorpoint") propRem = lRemKf.transform.anchorPoint;
          } else {
            var fxRem = lRemKf("Effects").property(params.propertyGroup);
            if (fxRem) propRem = fxRem.property(pNameRem);
          }
          if (!propRem) return wrapError("Property not found.", "PROPERTY_NOT_FOUND");

          var kIndex = Number(params.keyframeIndex);
          if (kIndex >= 1 && kIndex <= propRem.numKeys) {
            propRem.removeKey(kIndex);
            return wrapSuccess({ removedKeyIndex: kIndex, remainingKeys: propRem.numKeys });
          } else {
            return wrapError("Keyframe index out of range (1-" + propRem.numKeys + ").", "INDEX_OUT_OF_RANGE");
          }
        }

        case "get_render_queue_status": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          var rq = app.project.renderQueue;
          var rqItems = [];
          for (var ri = 1; ri <= rq.numItems; ri++) {
            var rItem = rq.item(ri);
            var statusStr = "queued";
            switch (rItem.status) {
              case RQItemStatus.WILL_CONTINUE: statusStr = "will_continue"; break;
              case RQItemStatus.NEEDS_OUTPUT: statusStr = "needs_output"; break;
              case RQItemStatus.UNQUEUED: statusStr = "unqueued"; break;
              case RQItemStatus.QUEUED: statusStr = "queued"; break;
              case RQItemStatus.RENDERING: statusStr = "rendering"; break;
              case RQItemStatus.USER_STOPPED: statusStr = "stopped"; break;
              case RQItemStatus.ERR_STOPPED: statusStr = "error"; break;
              case RQItemStatus.DONE: statusStr = "done"; break;
            }
            rqItems.push({
              index: ri,
              compName: rItem.comp ? rItem.comp.name : "Unknown",
              status: statusStr,
              startTime: rItem.startTime ? rItem.startTime.toString() : null
            });
          }
          return wrapSuccess({ renderQueueItems: rqItems, total: rqItems.length, rendering: rq.rendering });
        }

        case "add_comp_to_render_queue": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          var compRq = findComp(params.compositionId, params.compositionName);
          if (!compRq) return wrapError("Composition not found.", "COMP_NOT_FOUND");

          var queuedItem = app.project.renderQueue.items.add(compRq);
          if (params.outputFilePath) {
            var outF = new File(params.outputFilePath);
            queuedItem.outputModule(1).file = outF;
          }
          return wrapSuccess({
            queuedIndex: queuedItem.index,
            compName: compRq.name,
            outputFile: queuedItem.outputModule(1).file ? queuedItem.outputModule(1).file.fsName : null
          });
        }

        case "start_render_queue": {
          if (!app.project) return wrapError("No project open.", "NO_PROJECT");
          if (app.project.renderQueue.numItems === 0) {
            return wrapError("Render Queue has no items to render.", "EMPTY_QUEUE");
          }
          app.project.renderQueue.render();
          return wrapSuccess({ rendered: true });
        }

        case "execute_extendscript": {
          var scriptCode = params.script;
          if (!scriptCode) return wrapError("No script provided.", "MISSING_PARAM");
          var scriptResult = eval(scriptCode);
          return wrapSuccess(scriptResult !== undefined ? scriptResult : null);
        }

        default:
          return wrapError("Unsupported action: " + action, "UNSUPPORTED_ACTION");
      }
    } catch (e) {
      return wrapError(e.message, "UNHANDLED_EXCEPTION", { line: e.line });
    }
  };
})();
