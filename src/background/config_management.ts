﻿module DarkReader {

    //--------------------------------
    //
    //      CONFIGURATION LOADING
    //
    //--------------------------------

    var CONFIG_URLs = {
        darkSites: {
            remote: 'https://raw.githubusercontent.com/rbolsius/lights-out/master/src/config/dark_sites.json',
            local: '../config/dark_sites.json'
        },
        sitesFixes: {
            remote: 'https://raw.githubusercontent.com/rbolsius/lights-out/master/src/config/sites_fixes_v2.json',
            local: '../config/sites_fixes_v2.json'
        },
        defaultFilterConfig: {
            local: '../config/default_filter_config.json'
        }
    };
    var REMOTE_TIMEOUT_MS = 10 * 1000;
    var RELOAD_INTERVAL_MS = 15 * 60 * 1000;
    export var DEBUG = chrome.runtime.id !== 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
    var DEBUG_LOCAL_CONFIGS = DEBUG;

    /**
     * List of sites with dark theme (which should not be inverted).
     */
    export var DARK_SITES: string[];

    /**
     * Fixes for specific sites (selectors which should not be inverted).
     */
    export var SITES_FIXES: SitesFixes;

    //
    // ----- Load configs ------

    export function loadConfigs(done?: () => void) {
        if (!DEBUG_LOCAL_CONFIGS) {

            //
            // Load remote and local as fallback

            Promise.all<any>([

                //
                // Load dark sites

                readJson<string[]>({
                    url: CONFIG_URLs.darkSites.remote,
                    timeout: REMOTE_TIMEOUT_MS
                }).then((res) => {
                    return res;
                }).catch((err) => {
                    console.error('Dark Sites remote load error', err);
                    return readJson<string[]>({
                        url: CONFIG_URLs.darkSites.local
                    });
                }).then((res) => DARK_SITES = handleDarkSites(res)),

                //
                // Load sites fixes

                readJson<SitesFixes>({
                    url: CONFIG_URLs.sitesFixes.remote,
                    timeout: REMOTE_TIMEOUT_MS
                }).then((res) => {
                    return res;
                }).catch((err) => {
                    console.error('Sites Fixes remote load error', err);
                    return readJson<SitesFixes>({
                        url: CONFIG_URLs.sitesFixes.local
                    });
                }).then((res) => SITES_FIXES = handleSitesFixes(res)),

                //
                // Load default filter config

                readJson<FilterConfig>({
                    url: CONFIG_URLs.defaultFilterConfig.local
                }).then((res) => DEFAULT_FILTER_CONFIG = handleFilterConfig(res))

            ]).then(() => done && done(),
                (err) => console.error('Fatality', err));
        } else {
            // Load local configs only
            Promise.all<any>([
                // Load dark sites
                readJson<string[]>({
                    url: CONFIG_URLs.darkSites.local
                }).then((res) => DARK_SITES = handleDarkSites(res)),

                // Load sites fixes
                readJson<SitesFixes>({
                    url: CONFIG_URLs.sitesFixes.local
                }).then((res) => SITES_FIXES = handleSitesFixes(res)),

                // Load default filter config
                readJson<FilterConfig>({
                    url: CONFIG_URLs.defaultFilterConfig.local
                }).then((res) => DEFAULT_FILTER_CONFIG = handleFilterConfig(res))

            ]).then(() => done && done(),
                (err) => console.error('Fatality', err));
        }

        // --------- Data handling ----------

        function onInvalidData(desc) {
            if (DEBUG) throw new Error(desc);
            console.error('Invalid data: ' + desc);
        }
        function handleDarkSites(sites: string[]) {
            // Validate sites
            if (!Array.isArray(sites)) {
                sites = [];
                onInvalidData('List is not an array.');
            }
            for (var i = sites.length - 1; i >= 0; i--) {
                if (typeof sites[i] !== 'string') {
                    sites.splice(i, 1);
                    onInvalidData('URL is not a string.');
                }
            }
            sites.sort(urlTemplateSorter);
            return sites;
        };
        function handleSitesFixes(fixes: SitesFixes) {
            // Validate fixes
            if (fixes === null || typeof fixes !== 'object') {
                fixes = {
                    commonSelectors: [],
                    commonRules: [],
                    specials: []
                };
                onInvalidData('Fix is not an object.')
            }
            if (!isStringOrArray(fixes.commonSelectors)) {
                fixes.commonSelectors = [];
                onInvalidData('Missing common selectors.')
            }
            if (!Array.isArray(fixes.specials)) {
                fixes.specials = [];
                onInvalidData('Missing special selectors.');
            }
            if (typeof fixes.commonSelectors === 'string') {
                fixes.commonSelectors = [<any>fixes.commonSelectors];
            }
            if (typeof fixes.specials === 'string') {
                fixes.specials = [<any>fixes.specials];
            }
            for (var i = fixes.specials.length - 1; i >= 0; i--) {
                let s = fixes.specials[i];
                if (!isStringOrArray(s.url)) {
                    fixes.specials.splice(i, 1);
                    onInvalidData('Wrong URL.');
                    continue;
                }
                if (!isStringOrArray(s.selectors)) {
                    s.selectors = fixes.commonSelectors;
                    // TODO: Optional "selectors" property.
                    onInvalidData('Missing selectors.');
                }
                if (s.rules !== undefined &&
                    !isStringOrArray(s.rules)
                ) {
                    s.rules = [];
                    onInvalidData('Invalid CSS rules.');
                }
                if (typeof s.selectors === 'string') {
                    s.selectors = [<any>s.selectors];
                }
                if (typeof s.rules === 'string') {
                    s.rules = [<any>s.rules];
                }
            }
            // Sort like templates?

            // Replace "{common}" with common selectors
            fixes.specials.forEach((s) => {
                s.selectors = s.selectors.map((s) => {
                    return s.replace(
                        /\{common\}/ig,
                        joinLines(fixes.commonSelectors, ',')
                    );
                });
            });

            return fixes;
        };
        function handleFilterConfig(config: FilterConfig) {
            if (config === null || typeof config !== 'object') {
                config = DEFAULT_FILTER_CONFIG;
            } else {
                for (var prop in DEFAULT_FILTER_CONFIG) {
                    if (typeof config[prop] !== typeof DEFAULT_FILTER_CONFIG[prop]) {
                        onInvalidData(`Invalid config property "${prop}"`);
                        config[prop] = DEFAULT_FILTER_CONFIG[prop];
                    }
                }
            }
            return config;
        }
    }

    setInterval(loadConfigs, RELOAD_INTERVAL_MS); // Reload periodically

    export interface SitesFixes {
        commonSelectors: string[];
        commonRules: string[];
        specials: SiteFix[];
    }

    export interface SiteFix {
        url: string | string[];
        selectors?: string[];
        rules?: string[];
    }

    /**
     * Returns fixes for a given URL.
     * If no matches found, common fixes will be returned.
     * @param url Site URL.
     */
    export function getFixesFor(url: string): {
        selectors?: string[];
        rules?: string[];
    } {
        var found: SiteFix;
        if (url) {
            // Search for match with given URL
            loop: for (var i = 0; i < SITES_FIXES.specials.length; i++) {
                let s = SITES_FIXES.specials[i];
                let urls: string[] = typeof s.url === 'string' ? [<string>s.url] : <string[]>s.url;
                for (var j = 0; j < urls.length; j++) {
                    if (isUrlMatched(url, urls[j])) {
                        found = s;
                        break loop;
                    }
                }
            }
            if (found) {
                console.log('URL matches ' + found.url);
            }
        }
        return (found ?
            found :
            { selectors: SITES_FIXES.commonSelectors }
        );
    }


    //------------------
    //
    //     HELPERS
    //
    //------------------

    //
    // ---------- Data loading -----------

    /**
     * Loads and parses JSON from file to object.
     * @param params Object containing request parameters.
     */
    function readJson<T>(params: JsonRequestParams<T>): Promise<T> {
        var promise = new Promise((resolve, reject) => {

            var request = new XMLHttpRequest();
            request.overrideMimeType("application/json");
            request.open(
                'GET',
                params.url + '?nocache=' + new Date().getTime(),
                true
            );
            request.onload = () => {
                if (request.status >= 200 && request.status < 300) {
                    // Remove comments
                    var resultText = request.responseText
                        .replace(/(\".*?(\\\".*?)*?\")|(\/\*(.|[\r\n])*?\*\/)|(\/\/.*?[\r\n])/gm, '$1');

                    var json = JSON.parse(resultText);
                    resolve(json);
                }
                else {
                    reject(new Error(request.status + ': ' + request.statusText));
                }
            };
            request.onerror = (err: ErrorEvent) => reject(err.error);
            if (params.timeout) {
                request.timeout = params.timeout;
                request.ontimeout = () => reject(new Error('Config loading stopped due to timeout.'));
            }
            request.send();
        });
        return promise;
    }

    interface JsonRequestParams<T> {
        url: string;
        timeout?: number;
    }


    //
    // ---------- URL template matching ----------------

    /**
     * Determines whether URL has a match in URL template list.
     * @param url Site URL.
     * @paramlist List to search into.
     */
    export function isUrlInList(url: string, list: string[]) {
        for (var i = 0; i < list.length; i++) {
            if (isUrlMatched(url, list[i])) {
                console.log('URL ' + url + ' is in list.');
                return true;
            }
        }
        return false;
    }

    /**
     * Determines whether URL matches the template.
     * @param url URL.
     * @param urlTemplate URL template ("google.*", "youtube.com" etc).
     */
    function isUrlMatched(url: string, urlTemplate: string): boolean {
        var regex = createUrlRegex(urlTemplate);
        return !!url.match(regex);
    }

    function createUrlRegex(urlTemplate: string): RegExp {
        urlTemplate = urlTemplate.trim();
        var exactBeginning = (urlTemplate[0] === '^');
        var exactEnding = (urlTemplate[urlTemplate.length - 1] === '$');

        urlTemplate = (urlTemplate
            .replace(/^\^/, '') // Remove ^ at start
            .replace(/\$$/, '') // Remove $ at end
            .replace(/^.*?\/{2,3}/, '') // Remove scheme
            .replace(/\?.*$/, '') // Remove query
            .replace(/\/$/, '') // Remove last slash
        );

        var slashIndex: number;
        var beforeSlash: string;
        if ((slashIndex = urlTemplate.indexOf('/')) >= 0) {
            beforeSlash = urlTemplate.substring(0, slashIndex); // google.*
            var afterSlash = urlTemplate.replace('$', '').substring(slashIndex); // /login/abc
        }
        else {
            beforeSlash = urlTemplate.replace('$', '');
        }

        //
        // SCHEME and SUBDOMAINS

        var result = (exactBeginning ?
            '^(.*?\\:\\/{2,3})?' // Scheme
            : '^(.*?\\:\\/{2,3})?([^\/]*?\\.)?' // Scheme and subdomains
        );

        //
        // HOST and PORT

        var hostParts = beforeSlash.split('.');
        result += '(';
        for (var i = 0; i < hostParts.length; i++) {
            if (hostParts[i] === '*') {
                hostParts[i] = '[^\\.\\/]+?';
            }
        }
        result += hostParts.join('\\.');
        result += ')';

        //
        // PATH and QUERY

        if (afterSlash) {
            result += '(';
            result += afterSlash.replace('/', '\\/');
            result += ')';
        }

        result += (exactEnding ?
            '(\\/?(\\?[^\/]*?)?)$' // All following queries
            : '(\\/?.*?)$' // All following paths and queries
        );

        //
        // Result

        var regex = new RegExp(result, 'i');
        return regex;
    }

    /**
     * URL template sorter.
     */
    export var urlTemplateSorter = (a: { url?: string }, b: { url?: string }) => {
        if (typeof a === 'string')
            a = { url: <string>a };
        if (typeof b === 'string')
            b = { url: <string>b };
        var slashIndexA = a.url.indexOf('/');
        var slashIndexB = b.url.indexOf('/');
        var addressA = a.url.replace('^', '').substring(0, slashIndexA);
        var addressB = b.url.replace('^', '').substring(0, slashIndexB);
        var reverseA = addressA.split('.').reverse().join('.').toLowerCase(); // com.google
        var reverseB = addressB.split('.').reverse().join('.').toLowerCase(); // *.google

        // Sort by reversed address descending
        if (reverseA > reverseB) {
            return -1;
        }
        else if (reverseA < reverseB) {
            return 1;
        }
        else {
            // Then sort by path descending
            var pathA = a.url.substring(slashIndexA);
            var pathB = b.url.substring(slashIndexB);
            return -pathA.localeCompare(pathB);
        }
    };

    function joinLines(lines: string | string[], separator = ''): string {
        if (typeof lines === 'string') {
            return lines;
        }
        return (<string[]>lines).join(separator + '\\n');
    }

    function isStringOrArray(item) {
        return (typeof item === 'string' || Array.isArray(item));
    }
}
