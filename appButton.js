//#region imports

const { Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;
const { AppMenu } = imports.ui.appMenu;
const AppFavorites = imports.ui.appFavorites;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;

//#endregion imports

class AppButtonIndicator {

    constructor(parent, settings) {
        this._parent = parent;
        this._settings = settings;
        this._indicators = null;
        this._isActive = false;

        this._setConfig();
    }

    //#region public methods

    destroy() {

        this._parent = null;

        this._destroyIndicators();
    }

    update(windows = [], isActive) {

        const oldIsActive = this._isActive;

        // set active state
        this._isActive = isActive;

        // no need to display indicators
        if (!windows.length) {
            this._destroyIndicators();
            return;
        }

        // count the maximum number of indicators to display
        let maxIndicators = (
            windows.length > this._config.maxIndicators ?
            this._config.maxIndicators :
            windows.length
        );

        const indicatorsLength = this._indicators?.length || 0; 

        // no need to change indicators
        if (indicatorsLength === maxIndicators) {

            if (oldIsActive !== this._isActive) {
                this.rerender();
            }

            return;
        }

        // check if some idicators should be destroyed
        // this will be executed in case we have more than one indicator
        if (indicatorsLength > maxIndicators) {

            let indicatorsToDestroy = this._indicators.splice(maxIndicators, indicatorsLength - maxIndicators);

            for (let i = 0, l = indicatorsToDestroy.length; i < l; ++i) {
                this._destroyIndicator(indicatorsToDestroy[i]);
            }

        } else {

            // don't create more than we need to display
            maxIndicators -= indicatorsLength;

            // create new indicators
            for (let i = 0; i < maxIndicators; ++i) {
                this._addIndicator();
            }
        }

        this.rerender();
    }

    rerender() {

        if (!this._indicators?.length) {
            return;
        }

        for (let i = 0, l = this._indicators.length; i < l; ++i) {
            this._indicators[i].style = this._getIndicatorStyle(i);
        }   
    }

    //#endregion public methods

    //#region private methods

    _setConfig() {
        this._config = {
            color: 'rgb(255, 255, 255)',
            activeColor: 'rgb(53, 132, 228)',
            size: 4,
            maxIndicators: 2
        };
    }

    _addIndicator() {

        if (!this._parent) {
            return;
        }

        if (!this._indicators) {
            this._indicators = [];
        }

        const indicatorIndex = this._indicators.length;

        const indicator = new St.Icon({
            x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            opacity: 0
        });

        this._indicators.push(indicator);

        this._parent.add_actor(indicator);

        indicator.ease({
            opacity: 255,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _getIndicatorStyle(index) {

        let result = (
            `background-color: ${this._isActive ? this._config.activeColor : this._config.color};` +
            `width: ${this._config.size}px;` +
            `height: ${this._config.size}px;` +
            `border-radius: ${this._config.size}px;`
        );

        const indicatorsLength = this._indicators?.length || 0; 

        // check if no more indicators exist
        if (indicatorsLength <= 1) {
            return result;
        }

        // add margins when multiple idicators exist

        const margin = this._config.size + (this._config.size / 2);

        if (index === 0 || index < (indicatorsLength - 1)) {
            const marginOffset = indicatorsLength - 1 - index;
            result += `margin-right: ${margin * marginOffset}px;`;
        }

        if (index > 0) {
            result += `margin-left: ${margin * index}px;`;
        }

        return result;
    }

    _destroyIndicators() {

        if (!this._indicators?.length) {
            return;
        }

        for (let i = 0, l = this._indicators.length; i < l; ++i) {
            this._destroyIndicator(this._indicators[i]);
        }

        this._indicators = null;
    }

    _destroyIndicator(indicator) {

        if (!indicator) {
            return;
        } 

        indicator.remove_all_transitions();

        // no animation in this case
        if (!this._parent) {
            indicator.destroy();
            indicator = null;
            return;
        }

        indicator.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                indicator.destroy();
                indicator = null;
            }
        });
    }

    //#endregion private methods

}

class AppButtonMenu extends AppMenu {

    constructor(actor, app) {

        super(actor, St.Side.TOP, {
            favoritesSection: true,
            showSingleWindows: true,
        });

        this.blockSourceEvents = true;
        this.setApp(app);

        Main.uiGroup.add_actor(this.actor);
    }

    _updateFavoriteItem() {
        super._updateFavoriteItem();

        if (!this._toggleFavoriteItem.visible) {
            return;
        }

        if (!this._appFavorites.isFavorite(this._app.id)) {
            this._toggleFavoriteItem.label.text = _('Pin');
        }
    }

}

var AppButton = GObject.registerClass(
    class AppButton extends St.Button {

        //#region public methods

        setParent(parent, position, animation) {

            if (!parent) {
                return;
            }

            this.opacity = 0;

            parent.insert_child_at_index(this, position);

            this.rerender();

            if (!animation) {
                this.opacity = 255;
                return;
            }

            this.ease({
                opacity: 255,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        setPosition(position) {

            const parent = this.get_parent();

            if (!parent) {
                return;
            }

            //this.remove_all_transitions();

            parent.set_child_at_index(this, position);
        }

        rerender() {

            this._updateIcon();

            // call the function only once to avoid multiple loops 
            const windows = this._getAppWindows();

            this._handleAppState(windows);
            this.handlePosition(windows);
        }

        handlePosition() {
            this._updateIconGeometry();
        }

        //#endregion public methods

        //#region private methods

        _init(app, isFavorite, settings) {

            // init the button
            super._init({
                reactive: true,
                can_focus: true,
                track_hover: true,
                button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO
            });

            // set public properties
            this.app = app;
            this.appId = app.get_id();
            this.isFavorite = isFavorite;

            // set private properties
            this._settings = settings;
            this._isActive = false;
            this._isAppRunning = false; //TODO: use in a scroll action
            this._delegate = this;

            // idenitify initial configuration
            this._setConfig();

            // create layout
            this._createLayout();
            this._updateStyle();

            // create connections
            this._createConnections();
        }

        _setConfig() {
            this._config = {
                iconSize: 20,
                padding: 8,
                verticalMargin: 2,
                roundness: 100,
                spacing: 0
            };
        }

        _createLayout() {

            this._appIcon = new St.Bin({
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.FILL,
                style_class: 'panel-button'
            });

            this.bind_property('hover', this._appIcon, 'hover', GObject.BindingFlags.SYNC_CREATE);

            const container = new St.BoxLayout({
                vertical: true,
                y_expand: true,
                y_align: Clutter.ActorAlign.FILL
            });

            container.add_child(this._appIcon);

            this._layout = new Clutter.Actor({
                layout_manager: new Clutter.BinLayout(),
                y_expand: true,
                y_align: Clutter.ActorAlign.FILL
            });

            this._layout.add_actor(container);

            this.set_child(this._layout);

            this._indicator = new AppButtonIndicator(this._layout, this._settings);
        }

        _updateIcon() {
            this._appIcon.set_child(this.app.create_icon_texture(this._config.iconSize));
        }

        _createConnections() {
            // internal connections
            this.connect('clicked', () => this._activate());
            this.connect('button_press_event', () => this._handleButtonPress());
            this.connect('destroy', () => this._destroy());
            this.connect('key-focus-in', () => this._focus(true));
            this.connect('key-focus-out', () => this._focus(false));
            this.connect('notify::hover', () => this._hover());
            // external connections
            this._connections = new Map();
            this._connections.set(global.display.connect('notify::focus-window', () => this._handleAppState()), global.display);
            this._connections.set(global.display.connect('window-demands-attention', (display, window) => this._handleUrgentWindow(window)), global.display);
        }

        _handleButtonPress() {
            const event = Clutter.get_current_event();

            if (event?.get_button() === Clutter.BUTTON_SECONDARY) {
                this._openMenu();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }

        _activate() {

            const event = Clutter.get_current_event();

            if (!event) {
                return;
            }

            const isOverview = Main.overview._shown;
            const isCtrlPressed = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) != 0;
            const isMiddleButton = (
                event.type() === Clutter.EventType.BUTTON_RELEASE &&
                event.get_button() === Clutter.BUTTON_MIDDLE
            );
            const openNewWindow = (
                this.app.can_open_new_window() &&
                this.app.state === Shell.AppState.RUNNING &&
                (isCtrlPressed || isMiddleButton)
            );

            // hide gnome shell overview
            Main.overview.hide();

            // app is running and we want to open a new window for it
            if (openNewWindow) {
                IconGrid.zoomOutActor(this._appIcon);
                this.app.open_new_window(-1);
                return;
            }

            const windows = this._getAppWindows();

            // no app windows on the current workspace
            // open a new window for the app
            if (!windows.length) {

                IconGrid.zoomOutActor(this._appIcon);

                // a favorited app is running, but no windows on the current workspace
                // open a new window for the app
                if (this.app.state === Shell.AppState.RUNNING) {
                    this.app.open_new_window(-1);
                    return;
                }

                // app is not running
                // so run the app
                this.app.activate();
                return;
            }

            // activate/minimize a single window
            // or activate the first window when gnome shell overview is shown
            if (windows.length === 1 || isOverview) {
                
                const window = windows[0];
                
                if (window.minimized || !window.has_focus() || isOverview) {
                    Main.activateWindow(window);
                    return;
                }

                // minimize the window if it's active and has focus
                window.minimize();
                return;

            }

            this._cycleAppWindows(windows);
        }

        _cycleAppWindows(windows, reverse) {

            if (!windows || !windows.length) {
                return;
            }

            const lastFocusedWindow = windows[0];  

            windows = windows.sort((a, b) => {
                return a.get_stable_sequence() > b.get_stable_sequence();
            });

            const windowIndex = windows.indexOf(global.display.focus_window);

            let nextWindowIndex = (
                // when the app has no focused windows
                windowIndex < 0 ?
                // using index of the last focused window
                windows.indexOf(lastFocusedWindow) :
                // otherwise go to the next window of the app
                windowIndex + (reverse ? -1 : 1)
            );

            if (nextWindowIndex === windows.length) {
                nextWindowIndex = 0;
            } else if (nextWindowIndex < 0) {
                nextWindowIndex = windows.length - 1;
            }

            if (windowIndex != nextWindowIndex) {
                Main.activateWindow(windows[nextWindowIndex]);
            }
        }

        _openMenu() {

            if (!this._menu) {

                this._menu = new AppButtonMenu(this._layout, this.app);

                this._connections.set(this._menu.connect('open-state-changed', () => this._focus()), this._menu);

                this._contextMenuManager = new PopupMenu.PopupMenuManager(this);
                this._contextMenuManager.addMenu(this._menu);
            }

            this._menu.open(true);
            this._contextMenuManager.ignoreRelease();
        }

        _handleAppState(windows) {

            if (this.get_stage() === null) {
                return;
            }

            if (!windows) {
                // this code must be executed right here before validating the app state
                windows = this._getAppWindows();
            }

            // self destroy :)
            if (!this.isFavorite && !windows.length) {
                this.destroy();
                return;
            }

            // update running state
            this._isAppRunning = windows.length > 0;

            // update active state
            if (this._isActive !== this._hasFocusedWindow) {

                this._isActive = this._hasFocusedWindow;

                this._updateStyle();
            }

            this._indicator.update(windows, this._isActive);

            if (this._isActive) {
                this.get_parent()?.setActiveAppButton(this);
                this._scrollToAppButton();
            }
        }

        _updateStyle() {

            this._appIcon.style = (
                `padding: 0 ${this._config.padding}px;` +
                `margin: ${this._config.verticalMargin}px 0;` +
                `border-radius: ${this._config.roundness}px;` +
                // currently I have no idea how to completely remove the border
                // when border is 0 panel-button highlight doesn't work for some reason
                `border-width: 1px;`
            );

            this.style = `margin-right: ${this._config.spacing}px;`;

            if (this._isActive) {
                this._appIcon.add_style_pseudo_class('active');
                return;
            }

            this._appIcon.remove_style_pseudo_class('active');
        }

        /**
        * Update target for minimization animation
        * Credit: Dash to Dock
        * https://github.com/micheleg/dash-to-dock/blob/master/appIcons.js
        */
        _updateIconGeometry(windows) {

            // check if the app button is still present at all. When switching workpaces, the
            // button might have been destroyed in between.
            if (this.get_stage() === null) {
                return;
            }

            if (!windows) {
                windows = this._getAppWindows();
            }

            if (!windows.length) {
                return;
            }

            this.get_allocation_box();
            let rect = new Meta.Rectangle();

            [rect.x, rect.y] = this.get_transformed_position();
            [rect.width, rect.height] = this.get_transformed_size();

            for (let i = 0, l = windows.length; i < l; ++i) {
                windows[i].set_icon_geometry(rect);
            }
        }

        _getAppWindows() {

            this._hasFocusedWindow = false;

            // no windows for a stopped app
            if (this.app.state == Shell.AppState.STOPPED) {
                return [];
            }

            const workspaceIndex = global.workspace_manager.get_active_workspace_index();

            return this.app.get_windows().filter(window => {
                const result = window.get_workspace().index() === workspaceIndex && !window.skipTaskbar;

                if (result && window.has_focus()) {
                    // just a trick to avoid multiple loops
                    // one to find windows and another one to find focused windows
                    this._hasFocusedWindow = true;
                }

                return result;
            });
        }

        _handleUrgentWindow(window) {

            // make only active apps handle urgent windows
            if (!window || !this._isActive || window.has_focus()) {
                return;
            }

            const tracker = Shell.WindowTracker.get_default();
            const windowApp = tracker.get_window_app(window);

            if (!windowApp || windowApp.get_id() !== this.appId) {
                return;
            }

            // set focus on urgent windows of this app
            Main.activateWindow(window);
        }

        _focus(isFocused) {

            if (this._menu?.isOpen) {
                isFocused = true;
            }

            if (isFocused) {
                
                this._appIcon.add_style_pseudo_class('focus');
                
                this.get_parent()?.setActiveAppButton(null);
                
                this._scrollToAppButton();

                return;
            }

            this._appIcon.remove_style_pseudo_class('focus');
        }

        _hover() {
            this.get_parent()?.setScrollLock(this, this.hover);;
        }

        _destroy() {

            this.remove_all_transitions();

            // remove connections
            this._connections.forEach((connection, id) => {
                connection.disconnect(id);
                id = null;
            });
            this._connections = null;

            // destroy context menu
            this._menu?.close(false);
            //this._menu?.destroy();
            this._menu = null;
            this._contextMenuManager = null;

            // destroy indicator
            this._indicator?.destroy();
            this._indicator = null;
        }

        _scrollToAppButton() {

            if (this._menu?.isOpen) {
                return;
            }

            const parent = this.get_parent();

            if (!parent) {
                return;
            }

            parent.scrollToAppButton(this);
        }

        //#endregion private methods
    }
);