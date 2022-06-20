//#region imports

const { GLib } = imports.gi;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const HotCorner = imports.ui.layout.HotCorner;

// custom modules import
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { AppButton } = Me.imports.ui.appButton;
const { SoundVolumeControl } = Me.imports.utils.soundVolumeControl;
const { Connections } = Me.imports.utils.connections;

//#endregion imports

var ShellTweaks = class ShellTweaks {

    constructor(settings) {

        this._settings = settings;

        // enable tweaks with a small delay
        this._initTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {

            this._initTimeout = null;

            this._handleSettings();

            this._createConnections();

            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {

        // clear init timeout if exists
        if (this._initTimeout) {
            GLib.source_remove(this._initTimeout);
        }

        // remove connections
        this._connections?.destroy();

        this._removePanelScrollHandler();

        this._disableFullscreenHotCorner();

        this._disableActivitiesClickOverride();

        this._removeOverviewClickHandler();
    }

    _createConnections() {
        this._connections = new Connections();
        this._connections.add(this._settings, 'changed::panel-enable-scroll', () => this._handleSettings());
        this._connections.add(this._settings, 'changed::hotcorner-enable-in-fullscreen', () => this._handleSettings());
        this._connections.add(this._settings, 'changed::activities-enable-click-override', () => this._handleSettings());
        this._connections.add(this._settings, 'changed::overview-enable-empty-space-clicks', () => this._handleSettings());
    }

    _handleSettings() {

        this._setConfig();

        if (this._config.enablePanelScrollHandler) {
            this._addPanelScrollHandler();
        } else {
            this._removePanelScrollHandler();
        }

        if (this._config.enableFullscreenHotCorner) {
            this._enableFullscreenHotCorner();
        } else {
            this._disableFullscreenHotCorner();
        }

        if (this._config.enableActivitiesClickOverride) {
            this._enableActivitiesClickOverride();
        } else {
            this._disableActivitiesClickOverride();
        }

        if (this._config.enableOverviewClickHandler) {
            this._addOverviewClickHandler();
        } else {
            this._removeOverviewClickHandler();
        }
    }

    _setConfig() {
        this._config = {
            enablePanelScrollHandler: this._settings.get_boolean('panel-enable-scroll'),
            enableFullscreenHotCorner: this._settings.get_boolean('hotcorner-enable-in-fullscreen'),
            enableActivitiesClickOverride: this._settings.get_boolean('activities-enable-click-override'),
            enableOverviewClickHandler: this._settings.get_boolean('overview-enable-empty-space-clicks'),
            soundVolumeStep: 2, // 2% by default, 20% max - very fast, 1% min - very slow
            soundVolumeFastStep: 10
        };
    }

    //#region panel scroll handling

    _addPanelScrollHandler() {

        if (this._panelScrollHandler) {
            return;
        }

        this._soundVolumeControl = new SoundVolumeControl();

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

        this._soundVolumeControl.destroy();
        this._soundVolumeControl = null;
    }

    _handlePanelScroll(event) {
        
        const scrollDirection = event?.get_scroll_direction();

        // handle only 2 directions: UP and DOWN
        if (scrollDirection !== Clutter.ScrollDirection.UP &&
                scrollDirection !== Clutter.ScrollDirection.DOWN) {
            return Clutter.EVENT_PROPAGATE;
        }

        // change sound volume

        if (!this._soundVolumeControl) {
            return Clutter.EVENT_PROPAGATE;
        }

        const isCtrlPressed = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) != 0;
        const soundVolumeStep = (
            isCtrlPressed ?
            this._config.soundVolumeFastStep :
            this._config.soundVolumeStep
        );

        this._soundVolumeControl.addVolume(
            scrollDirection === Clutter.ScrollDirection.UP ?
            soundVolumeStep :
            -soundVolumeStep
        );

        return Clutter.EVENT_STOP;
    }

    //#endregion panel scroll handling

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

            if (Main.overview.shouldToggleByCornerOrButton()) {
                Main.overview._overview._controls._toggleAppsPage();
            }

            return Clutter.EVENT_STOP;
        });
    }

    _disableActivitiesClickOverride() {

        if (!this._activitiesClickHandler) {
            return;
        }

        const activitiesButton = Main.panel.statusArea['activities'];

        activitiesButton.disconnect(this._activitiesClickHandler);

        this._activitiesClickHandler = null;
    }

    //#endregion activities button tweaks

    //#region overview tweaks

    _addOverviewClickHandler() {

        if (this._overviewClickHandler) {
            return;
        }

        // backup the overview reactivity
        this._overviewOldReactivity = Main.overview._overview._controls.reactive;

        // make the overview reactive
        Main.overview._overview._controls.reactive = true;

        // create a click handler
        this._overviewClickHandler = new Clutter.ClickAction();
        this._overviewClickHandler.connect('clicked', action => {

            // just toggle overview when primary button clicked
            if (action.get_button() == Clutter.BUTTON_PRIMARY) {
                Main.overview.toggle();
                return;
            }
            
            // toggle apps page when secondary button clicked
            if (action.get_button() === Clutter.BUTTON_SECONDARY) {
                Main.overview._overview._controls._toggleAppsPage()
            }

        });

        // add click action to the overview
        Main.overview._overview._controls.add_action(this._overviewClickHandler);
    }

    _removeOverviewClickHandler() {

        if (!this._overviewClickHandler) {
            return;
        }

        // restore overview reactivity
        Main.overview._overview._controls.reactive = this._overviewOldReactivity;
        this._overviewOldReactivity = null;

        // remove custom click action from the overview
        Main.overview._overview._controls.remove_action(this._overviewClickHandler);
        this._overviewClickHandler = null;
    }

    //#endregion overview tweaks

}