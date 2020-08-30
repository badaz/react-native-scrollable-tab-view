const React = require('react');
const { Component } = React;
const { ViewPropTypes } = ReactNative = require('react-native');
const createReactClass = require('create-react-class');
const PropTypes = require('prop-types');
const {
  Dimensions,
  View,
  Animated,
  ScrollView,
  StyleSheet,
  InteractionManager,
} = ReactNative;

const ViewPager = require('@react-native-community/viewpager');
const TimerMixin = require('react-timer-mixin');

const SceneComponent = require('./SceneComponent');
const DefaultTabBar = require('./DefaultTabBar');
const ScrollableTabBar = require('./ScrollableTabBar');

const AnimatedViewPager =
  Animated.createAnimatedComponent(ViewPager);

const ScrollableTabView = createReactClass({
  mixins: [TimerMixin, ],
  statics: {
    DefaultTabBar,
    ScrollableTabBar,
  },
  scrollOnMountCalled: false,
  tabWillChangeWithoutGesture: false,

  propTypes: {
    tabBarPosition: PropTypes.oneOf(['top', 'bottom', 'overlayTop', 'overlayBottom', ]),
    initialPage: PropTypes.number,
    page: PropTypes.number,
    onChangeTab: PropTypes.func,
    onScroll: PropTypes.func,
    renderTabBar: PropTypes.any,
    tabBarUnderlineStyle: ViewPropTypes.style,
    tabBarBackgroundColor: PropTypes.string,
    tabBarActiveTextColor: PropTypes.string,
    tabBarInactiveTextColor: PropTypes.string,
    tabBarTextStyle: PropTypes.object,
    style: ViewPropTypes.style,
    contentProps: PropTypes.object,
    scrollWithoutAnimation: PropTypes.bool,
    locked: PropTypes.bool,
    prerenderingSiblingsNumber: PropTypes.number,
  },

  getDefaultProps() {
    return {
      tabBarPosition: 'top',
      initialPage: 0,
      page: -1,
      onChangeTab: () => {},
      onScroll: () => {},
      contentProps: {},
      scrollWithoutAnimation: false,
      locked: false,
      prerenderingSiblingsNumber: 0,
    };
  },

  getInitialState() {
    const containerWidth = Dimensions.get('window').width;
    let scrollValue;
    let position;
    let offset;

    position = new Animated.Value(this.props.initialPage);
    offset = new Animated.Value(0);
    scrollValue = Animated.add(position, offset);

    const callListeners = this._polyfillAnimatedValue(scrollValue);
    let positionValue = this.props.initialPage;
    let offsetValue = 0;
    position.addListener(({ value, }) => {
      positionValue = value;
      callListeners(positionValue + offsetValue);
    });
    offset.addListener(({ value, }) => {
      offsetValue = value;
      callListeners(positionValue + offsetValue);
    });

    return {
      currentPage: this.props.initialPage,
      scrollValue,
      position,
      offset,
      containerWidth,
      sceneKeys: this.newSceneKeys({ currentPage: this.props.initialPage, }),
    };
  },

  componentDidUpdate(prevProps) {
    if (this.props.children !== prevProps.children) {
      this.updateSceneKeys({ page: this.state.currentPage, children: this.props.children, });
    }

    if (this.props.page >= 0 && this.props.page !== this.state.currentPage) {
      this.goToPage(this.props.page);
    }
  },

  componentWillUnmount() {
    this.state.position.removeAllListeners();
    this.state.offset.removeAllListeners();
  },

  goToPage(pageNumber) {

    if (this.scrollView) {
      this.tabWillChangeWithoutGesture = true;
      if (this.props.scrollWithoutAnimation) {
        this.scrollView.setPageWithoutAnimation(pageNumber);
      } else {
        this.scrollView.setPage(pageNumber);
      }
    }

    const currentPage = this.state.currentPage;
    this.updateSceneKeys({
      page: pageNumber,
      callback: this._onChangeTab.bind(this, currentPage, pageNumber),
    });
  },

  renderTabBar(props) {
    if (this.props.renderTabBar === false) {
      return null;
    } else if (this.props.renderTabBar) {
      return React.cloneElement(this.props.renderTabBar(props), props);
    } else {
      return <DefaultTabBar {...props} />;
    }
  },

  updateSceneKeys({ page, children = this.props.children, callback = () => {}, }) {
    let newKeys = this.newSceneKeys({ previousKeys: this.state.sceneKeys, currentPage: page, children, });
    this.setState({currentPage: page, sceneKeys: newKeys, }, callback);
  },

  newSceneKeys({ previousKeys = [], currentPage = 0, children = this.props.children, }) {
    let newKeys = [];
    this._children(children).forEach((child, idx) => {
      let key = this._makeSceneKey(child, idx);
      if (this._keyExists(previousKeys, key) ||
        this._shouldRenderSceneKey(idx, currentPage)) {
        newKeys.push(key);
      }
    });
    return newKeys;
  },

  // Animated.add and Animated.divide do not currently support listeners so
  // we have to polyfill it here since a lot of code depends on being able
  // to add a listener to `scrollValue`. See https://github.com/facebook/react-native/pull/12620.
  _polyfillAnimatedValue(animatedValue) {

    const listeners = new Set();
    const addListener = (listener) => {
      listeners.add(listener);
    };

    const removeListener = (listener) => {
      listeners.delete(listener);
    };

    const removeAllListeners = () => {
      listeners.clear();
    };

    animatedValue.addListener = addListener;
    animatedValue.removeListener = removeListener;
    animatedValue.removeAllListeners = removeAllListeners;

    return (value) => listeners.forEach(listener => listener({ value, }));
  },

  _shouldRenderSceneKey(idx, currentPageKey) {
    let numOfSibling = this.props.prerenderingSiblingsNumber;
    return (idx < (currentPageKey + numOfSibling + 1) &&
      idx > (currentPageKey - numOfSibling - 1));
  },

  _keyExists(sceneKeys, key) {
    return sceneKeys.find((sceneKey) => key === sceneKey);
  },

  _makeSceneKey(child, idx) {
    return child.props.tabLabel + '_' + idx;
  },

  renderScrollableContent() {
    const scenes = this._composeScenes();
    return <AnimatedViewPager
      key={this._children().length}
      style={styles.scrollableContent}
      initialPage={this.props.initialPage}
      onPageSelected={this._updateSelectedPage}
      keyboardDismissMode="on-drag"
      scrollEnabled={!this.props.locked}
      onPageScroll={Animated.event(
        [{
          nativeEvent: {
            position: this.state.position,
            offset: this.state.offset,
          },
        }, ],
        {
          useNativeDriver: true,
          listener: this._onScroll,
        },
      )}
      ref={(scrollView) => { this.scrollView = scrollView; }}
      {...this.props.contentProps}
    >
      {scenes}
    </AnimatedViewPager>;
  },

  _composeScenes() {
    return this._children().map((child, idx) => {
      let key = this._makeSceneKey(child, idx);
      return <SceneComponent
        key={child.key}
        shouldUpdated={this._shouldRenderSceneKey(idx, this.state.currentPage)}
        style={{width: this.state.containerWidth, }}
      >
        {this._keyExists(this.state.sceneKeys, key) ? child : <View tabLabel={child.props.tabLabel}/>}
      </SceneComponent>;
    });
  },

  _onMomentumScrollBeginAndEnd(e) {
    const offsetX = e.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / this.state.containerWidth);
    if (this.state.currentPage !== page) {
      this._updateSelectedPage(page);
    }
  },

  _updateSelectedPage(nextPage) {
    let localNextPage = nextPage;
    if (typeof localNextPage === 'object') {
      localNextPage = nextPage.nativeEvent.position;
    }

    const currentPage = this.state.currentPage;
    !this.tabWillChangeWithoutGesture && this.updateSceneKeys({
      page: localNextPage,
      callback: this._onChangeTab.bind(this, currentPage, localNextPage),
    });
    this.tabWillChangeWithoutGesture = false;
  },

  _onChangeTab(prevPage, currentPage) {
    this.props.onChangeTab({
      i: currentPage,
      ref: this._children()[currentPage],
      from: prevPage,
    });
  },

  _onScroll(e) {
    const { position, offset, } = e.nativeEvent;
    this.props.onScroll(position + offset);
  },

  _handleLayout(e) {
    const { width, } = e.nativeEvent.layout;

    if (!width || width <= 0 || Math.round(width) === Math.round(this.state.containerWidth)) {
      return;
    }

    this.setState({ containerWidth: width, });
    this.requestAnimationFrame(() => {
      this.goToPage(this.state.currentPage);
    });
  },

  _children(children = this.props.children) {
    return React.Children.map(children, (child) => child);
  },

  render() {
    let overlayTabs = (this.props.tabBarPosition === 'overlayTop' || this.props.tabBarPosition === 'overlayBottom');
    let tabBarProps = {
      goToPage: this.goToPage,
      tabs: this._children().map((child) => child.props.tabLabel),
      activeTab: this.state.currentPage,
      scrollValue: this.state.scrollValue,
      containerWidth: this.state.containerWidth,
    };

    if (this.props.tabBarBackgroundColor) {
      tabBarProps.backgroundColor = this.props.tabBarBackgroundColor;
    }
    if (this.props.tabBarActiveTextColor) {
      tabBarProps.activeTextColor = this.props.tabBarActiveTextColor;
    }
    if (this.props.tabBarInactiveTextColor) {
      tabBarProps.inactiveTextColor = this.props.tabBarInactiveTextColor;
    }
    if (this.props.tabBarTextStyle) {
      tabBarProps.textStyle = this.props.tabBarTextStyle;
    }
    if (this.props.tabBarUnderlineStyle) {
      tabBarProps.underlineStyle = this.props.tabBarUnderlineStyle;
    }
    if (overlayTabs) {
      tabBarProps.style = {
        position: 'absolute',
        left: 0,
        right: 0,
        [this.props.tabBarPosition === 'overlayTop' ? 'top' : 'bottom']: 0,
      };
    }

    return <View style={[styles.container, this.props.style, ]} onLayout={this._handleLayout}>
      {this.props.tabBarPosition === 'top' && this.renderTabBar(tabBarProps)}
      {this.renderScrollableContent()}
      {(this.props.tabBarPosition === 'bottom' || overlayTabs) && this.renderTabBar(tabBarProps)}
    </View>;
  },
});

module.exports = ScrollableTabView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollableContent: {
    flex: 1,
  },
});
