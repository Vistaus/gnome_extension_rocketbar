const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { GeneralPage } = Me.imports.settings.generalPage;
const { CustomizePage } = Me.imports.settings.customizePage;
const { BehaviorPage } = Me.imports.settings.behaviorPage;
const { AboutPage } = Me.imports.settings.aboutPage;

function init() {
    //TODO: ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    const settings = ExtensionUtils.getSettings();

    // enable search
    window.set_search_enabled(true);

    // create pages
    window.add(new GeneralPage(settings));
    window.add(new CustomizePage(settings));
    window.add(new BehaviorPage(settings));
    window.add(new AboutPage());
}