;(function (window, Extensions, mapbox, undefined) {
    'use strict';

    window.Extensions = Extensions;

    var retina = typeof window.devicePixelRatio !== 'undefined';

    /**
     * Map
     * ===
     *
     * @type {Class}
     */

    Extensions.Map = new Class({
        Implements: [Options, Events],

        options: {
            duration        : 300,
            mapID           : '',
            zoom            : 10,
            markerJSONLoc   : '',
            center          : {
                lat: 0,
                lon: 0
            }
        },

        transitions: {
            info: undefined,
            marker: undefined
        },

        isInfoOpen: false,

        openMarker: undefined,

        initialize: function(mapID, options) {
            this.setOptions(options);

            // Elements
            this.mapEl      = document.id(mapID);

            if (this.mapEl === null) return;

            this.info       = this.mapEl.getElement('div.info');
            this.infoClose  = this.info.getElement('a.info-close');
            this.infoInner  = this.info.getElement('div.info-inner');
            this.markers    = [];
            this.markerObjs = [];

            // Mapbox objects
			mapbox.MAPBOX_URL = 'https://a.tiles.mapbox.com/v3/';
            this.map    = mapbox.map(
                mapID,
                undefined,
                undefined,
                [
                    easey_handlers.DragHandler(),
                    easey_handlers.DoubleClickHandler(),
                    easey_handlers.TouchHandler()
                ]
            );

            if (retina) {
                this.options.zoom++;

                this.map.tileSize = {
                    x: 128,
                    y: 128
                };
            }

            // Get marker data
            this._fetchMarkers();

            // Set up info box transition
            this.transitions.info   = new Fx.Morph(this.info, {
                duration: this.options.duration
            });

            // Do initial map set up tasks
            this._initialSetup();

            // Customise the UI controls
            this._adaptUI();

            // Set up UI events
            this._UIEvents();
        },

        _initialSetup: function() {
            // Add visual map layer (from Mapbox map ID)
            this.map.addLayer(mapbox.layer().id(this.options.mapID));

            // Set initial zoom/location
            this.map.centerzoom(
                this.options.center,
                this.options.zoom
            );
        },

        _markerClick: function (marker) {
            var _this = this;

            if (this.isInfoOpen) {
                if (marker === this.openMarker) {
                    return;
                }

                var callback = function () {
                    _this.showMarkerInfo(marker);

                    _this.transitions.info.removeEvent('complete', callback);
                };

                this.transitions.info.addEvent('complete', callback);

                this.transitions.info.start({
                    opacity: 0,
                    transform: 'scale(.9)'
                });
            } else {
                _this.showMarkerInfo(marker);
            }
        },

        _fetchMarkers: function() {
            var _this   = this,
                i       = 0;

            _this.options.markerJSONLoc.each(function (loc) {
                new Request.JSON({
                    url         : loc,
                    onSuccess   : function (data) {
                        _this.markerObjs.combine(data);

                        i++;

                        if (i === _this.options.markerJSONLoc.length) {
                            _this._setUpMarkers();
                        }
                    }
                }).send();
            });
        },

        _setUpMarkers: function() {
            var _this   = this;

            this.markerLayer    = mapbox.markers.layer().features(this.markerObjs);

            // Add marker layer
            this.map.addLayer(this.markerLayer);

            // Cancel default marker interaction so we can override
            // it with custom behaviour
            mapbox.markers.interaction(this.markerLayer).remove();

            this.markerLayer.factory(function (obj) {
                var markerArr   = [],
                    marker      = new Element('img', {
                    'class' : 'marker-image',
                    src     : obj.properties.image
                });

                // Add img el to markers array
                _this.markers.push(marker);

                // Conditionally add buffalo class
                if (obj.properties.marker === 'buffalo') {
                    marker.addClass('buffalo');
                }

                marker.set('morph', {
                    duration: 150
                });

                // Marker events
                marker.addEvents({
                    mouseenter: function () {
                        marker.setStyle('z-index', 2);
                    },
                    mouseleave: function () {
                        if (marker.hasClass('active')) return;

                        marker.setStyle('z-index', 1);
                    },
                    touchend: function () {
                        marker.addClass('active');

                        _this._markerClick(obj);
                    },
                    click: function () {
                        _this.markers.each(function (m) {
                            m.removeClass('active');
                        });

                        marker.addClass('active');

                        _this._markerClick(obj);
                    }
                });

                return marker;
            });
        },

        _adaptUI: function() {
            // Add zoom buttons
            this.map.ui.zoomer.add();

            // Add zoom box (shift + drag)
            this.map.ui.zoombox.add();

            // Add full-screen toggle button
            this.map.ui.fullscreen.add();
        },

        showMarkerInfo: function(marker) {
            var _this = this;

            // Set info open flag
            this.isInfoOpen = true;

            // Cache reference to open marker
            this.openMarker = marker;

            // Reset info box styling
            this.info.setStyles({
                display: 'block',
                opacity: 0,
                transform: 'scale(.9)'
            });

            // Add info box content
            this.infoInner.set('html',
                (marker.properties.name ? '<h4>' + marker.properties.name + '</h4>' : '') +
                (marker.properties.description ? '<p>' + marker.properties.description + '</p>' : '') +
                (marker.properties.url ? '<a class="map-meta ss-icon ss-standard" href="'+ marker.properties.url +'">&#x1F517;</a>' : '')
            );

            if (window.scaleSvgs) window.scaleSvgs();

            // Animate in info box
            setTimeout(function () {
                _this.transitions.info.start({
                    opacity: 1,
                    transform: 'scale(1)'
                });
            }, 0);

            // Center marker
            this.map.ease
                .location({
                    lat: marker.geometry.coordinates[1],
                    lon: marker.geometry.coordinates[0]
                })
                .zoom(this.map.zoom())
                .optimal();
        },

        _UIEvents: function() {
            var _this       = this,
                close       = this.mapEl.getElement('.map-fullscreen'),
                callback    = function () {
                    _this.info.setStyle('display', 'none');

                    _this.isInfoOpen = false;

                    _this.openMarker = undefined;

                    _this.transitions.info.removeEvent('complete', callback);
                },
                closeInfo   = function () {
                    _this.transitions.info.addEvent('complete', callback);

                    _this.transitions.info.start({
                        opacity: 0,
                        transform: 'scale(1.1)'
                    });

                    _this.markers.each(function (m) {
                        m.removeClass('active');

                        m.setStyle('z-index', 1);
                    });
                };

            this.infoClose.addEvents({
                click: function (e) {
                    e.preventDefault();

                    closeInfo();
                },
                touchend: closeInfo
            });

            var html = document.getElement('html');

            function escClose(e) {
                if (e.key === 'esc') {
                    close.fireEvent('click');

                    _this.mapEl.removeClass('map-fullscreen-map');
                }
            }

            close.addEvents({
                click: function () {
                    this.toggleClass('active');

                    if (this.hasClass('active')) {
//                        window.addEvent('keyup', escClose);

                        html.setStyle('overflow', 'hidden');
                    } else {
//                        window.removeEvent('keyup', escClose);

                        html.setStyle('overflow', 'auto');
                    }
                },
                touchend: function () {
                    close.fireEvent('click');

                    _this.mapEl.toggleClass('map-fullscreen-map');
                }
            });
        }
    });

    // DOM ready
    window.addEvent('domready', function () {
        new Extensions.Map(
            'map-find-us',
            {
                mapID           : retina ? 'alexdunphy.map-s3qafq6w' : 'alexdunphy.map-kuojcq3i',
                zoom            : 15,
                markerJSONLoc   : [
                    '/places'
                ],
                center          : {
                    lat: 50.82438,
                    lon: -0.135655
                }
            }
        );
    });
})(window, window.Extensions || {}, window.mapbox);
