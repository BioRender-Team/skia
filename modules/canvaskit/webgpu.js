// Adds compile-time JS functions to augment the CanvasKit interface.
// Specifically, anything that should only be on the WebGL version of canvaskit.
// Functions in this file are supplemented by cpu.js.
(function(CanvasKit){
    CanvasKit._extraInitializations = CanvasKit._extraInitializations || [];
    CanvasKit._extraInitializations.push(function() {
      CanvasKit.MakeGPUDeviceContext = function(device) {
        if (!device) {
          return null;
        }

        // This allows native code to access this device by calling
        // `emscripten_webgpu_get_device().`
        CanvasKit.preinitializedWebGPUDevice = device;
        var devCtx = this._MakeWebGPUDeviceContext();
        if (!devCtx) {
          return null;
        }
        devCtx._device = device;
        return devCtx;
      };

      CanvasKit.MakeGPUCanvasContext = function(devCtx, canvas, opts) {
        var canvasCtx = canvas.getContext('webgpu');
        if (!canvasCtx) {
          return null;
        }

        let format = (opts && opts.format) ? opts.format : navigator.gpu.getPreferredCanvasFormat();
        // GPUCanvasConfiguration
        canvasCtx.configure({
            device: devCtx._device,
            format: format,
            alphaMode: (opts && opts.alphaMode) ? opts.alphaMode : undefined,
        });

        var context = {
          '_inner': canvasCtx,
          '_deviceContext': devCtx,
          '_textureFormat': format,
        };
        context['requestAnimationFrame'] =  function(callback) {
          requestAnimationFrame(function() {
            const surface = CanvasKit.MakeGPUCanvasSurface(context);
            if (!surface) {
              console.error('Failed to initialize Surface for current canvas swapchain texture');
              return;
            }
            callback(surface.getCanvas());
            surface.flush();
            // WebGPU (Graphite) requires submitting the recorder to present.
            canvasCtx._deviceContext && canvasCtx._deviceContext.submit && canvasCtx._deviceContext.submit();
            surface.dispose();
          });
        };
        return context;
      };

      CanvasKit.MakeGPUCanvasSurface = function(canvasCtx, colorSpace, width, height) {
        let context = canvasCtx._inner;
        if (!width) {
          width = context.canvas.width;
        }
        if (!height) {
          height = context.canvas.height;
        }
        let surface = this.MakeGPUTextureSurface(canvasCtx._deviceContext,
                                                 context.getCurrentTexture(),
                                                 canvasCtx._textureFormat,
                                                 width, height, colorSpace);
        // Keep a reference so helpers can submit after flushing.
        surface._deviceContext = canvasCtx._deviceContext;
        surface._canvasContext = canvasCtx;
        return surface;
      };

      CanvasKit.MakeGPUTextureSurface = function (devCtx, texture, textureFormat, width, height, colorSpace) {
          colorSpace = colorSpace || null;

          // JsValStore and WebGPU are objects in Emscripten's library_html5_webgpu.js utility
          // library. JsValStore allows a WebGPU object to be imported by native code by calling the
          // various `emscripten_webgpu_import_*` functions.
          //
          // The CanvasKit WASM module is responsible for removing entries from the value store by
          // calling `emscripten_webgpu_release_js_handle` after importing the object.
          //
          // (see
          // https://github.com/emscripten-core/emscripten/blob/0e63f74f36b06849ef1c777b130783a43316ade0/src/library_html5_webgpu.js
          // for reference)
          return this._MakeGPUTextureSurface(
              devCtx,
              this.JsValStore.add(texture),
              this.WebGPU.TextureFormat.indexOf(textureFormat),
              width, height,
              colorSpace);
      };

      CanvasKit.Surface.prototype.requestAnimationFrame = function(callback, dirtyRect) {
        return requestAnimationFrame(function() {
          // For WebGPU canvases, the swapchain/current texture is per-frame. A Surface created
          // from a previous `getCurrentTexture()` cannot be reused on subsequent frames.
          // Re-wrap the current texture each frame and draw into that temporary Surface.
          if (this._canvasContext) {
            const frameSurface = CanvasKit.MakeGPUCanvasSurface(this._canvasContext);
            if (!frameSurface) {
              console.error('Failed to initialize Surface for current canvas swapchain texture');
              return;
            }
            callback(frameSurface.getCanvas());
            frameSurface.flush(dirtyRect);
            frameSurface._deviceContext && frameSurface._deviceContext.submit &&
                frameSurface._deviceContext.submit();
            frameSurface.dispose();
            return;
          }

          callback(this.getCanvas());
          this.flush(dirtyRect);
          this._deviceContext && this._deviceContext.submit && this._deviceContext.submit();
        }.bind(this));
      };

      CanvasKit.Surface.prototype.drawOnce = function(callback, dirtyRect) {
        requestAnimationFrame(function() {
          // See requestAnimationFrame(): WebGPU swapchain textures are per-frame.
          if (this._canvasContext) {
            const frameSurface = CanvasKit.MakeGPUCanvasSurface(this._canvasContext);
            if (!frameSurface) {
              console.error('Failed to initialize Surface for current canvas swapchain texture');
              this.dispose();
              return;
            }
            callback(frameSurface.getCanvas());
            frameSurface.flush(dirtyRect);
            frameSurface._deviceContext && frameSurface._deviceContext.submit &&
                frameSurface._deviceContext.submit();
            frameSurface.dispose();
            this.dispose();
            return;
          }

          callback(this.getCanvas());
          this.flush(dirtyRect);
          this._deviceContext && this._deviceContext.submit && this._deviceContext.submit();
          this.dispose();
        }.bind(this));
      };
    });
}(Module));  // When this file is loaded in, the high level object is "Module".
