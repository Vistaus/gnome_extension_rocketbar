const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const HotCorner = imports.ui.layout.HotCorner;
//const { ActivitiesButton } = imports.ui.panel;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { AppButton } = Me.imports.ui.appButton;
const { SoundVolumeControl } = Me.imports.utils.soundVolumeControl;

var ShellTweaks = class ShellTweaks {

    constructor(settings) {

        this._setConfig(settings);

        this._soundVolumeControl = new SoundVolumeControl();

        this._addPanelScrollHandler();

        this._enableFullscreenHotCorner();

        this._enableActivitiesClickOverride();
    }

    destroy() {

        this._soundVolumeControl.destroy();
        this._soundVolumeControl = null;

        this._removePanelScrollHandler();

        this._disableFullscreenHotCorner();

        this._disableActivitiesClickOverride();
    }

    _setConfig(settings) {
        this._config = {
            soundVolumeStep: 2 // 2% by default, 20% max - very fast, 1% min - very slow
        };
    }

    //#region panel scroll override

    _addPanelScrollHandler() {

        if (this._panelScrollHandler) {
            return;
        }

        this._panelScrollHandler = Main.panel.connect(
            'scroll-event',
            (actor, event) => this._handlePanelScroll(event)
        );
    }

    _removePanelScrollHandler() {

        if (!this._panelScrollHandler) {
            return;
        }

        Main.panel.disconnect(this._panelScrollHandler);

        this._panelScrollHandler = null;
    }

    _handlePanelScroll(event) {

        if (!event) {
            return;
        }
        
        const scrollDirection = event.get_scroll_direction();

        // handle only 2 directions: UP and DOWN
        if (scrollDirection !== Clutter.ScrollDirection.UP &&
                scrollDirection !== Clutter.ScrollDirection.DOWN) {
            return Clutter.EVENT_PROPAGATE;
        }

        // get actor under the mouse cursor
        const eventSource = event.get_source();

        // handle scroll by the app button
        if (eventSource instanceof AppButton) {
            eventSource.handleScroll(scrollDirection);
            return Clutter.EVENT_STOP;
        }

        // change sound volume

        if (!this._soundVolumeControl) {
            return Clutter.EVENT_PROPAGATE;
        }

        this._soundVolumeControl.addVolume(
            scrollDirection === Clutter.ScrollDirection.UP ?
            this._config.soundVolumeStep :
            -this._config.soundVolumeStep
        );

        return Clutter.EVENT_STOP;
    }

    //#endregion panel scroll override

    //#region hot corner tweaks

    _enableFullscreenHotCorner() {

        if (this._originalToggleOverview) {
            return;
        }

        // backup the original function
        this._originalToggleOverview = HotCorner.prototype._toggleOverview;

        // override the function
        HotCorner.prototype._toggleOverview = function() {

            if (!Main.overview.shouldToggleByCornerOrButton()) {
                return;
            }
            
            Main.overview.toggle();
            
            if (!Main.overview.animationInProgress) {
                return;
            }
            
            this._ripples.playAnimation(this._x, this._y);
        };

        Main.layoutManager._updateHotCorners();
    }

    _disableFullscreenHotCorner() {

        if (!this._originalToggleOverview) {
            return;
        }

        HotCorner.prototype._toggleOverview = this._originalToggleOverview;
        Main.layoutManager._updateHotCorners();

        this._originalToggleOverview = null;
    }

    //#endregion hot corner tweaks

    //#region activities button tweaks

    _enableActivitiesClickOverride() {

        if (this._activitiesClickHandler) {
            return;
        }

        const activitiesButton = Main.panel.statusArea['activities'];

        this._activitiesClickHandler = activitiesButton.connect('captured_event', (actor, event) => {

            if (event.type() !== Clutter.EventType.BUTTON_RELEASE ||
                    event.get_button() !== Clutter.BUTTON_SECONDARY) {
                return Clutter.EVENT_PROPAGATE;
            }

            if (Main.overview.visible &&
                    Main.overview._overview._controls.dash.showAppsButton.checked) {
                return Clutter.EVENT_PROPAGATE;
            }
            
            Main.overview._overview._controls._toggleAppsPage();

            return Clutter.EVENT_STOP;
        });
    }

    _disableActivitiesClickOverride() {

        if (!this._activitiesClickHandler) {
            return;
        }

        const activitiesButton = Main.panel.statusArea['activities'];

        activitiesButton.disconnect(this._activitiesClickHandler);
    }

    //#endregion activities button tweaks
}