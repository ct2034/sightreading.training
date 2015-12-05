
let {PropTypes: types} = React;

const DEFAULT_NOTE_WIDTH = 100;
const DEFAULT_SPEED = 400;

class Page extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      midi: null,
      notes: new NoteList(),
      hits: 0,
      misses: 0,
      noteShaking: false,
      heldNotes: {},
      touchedNotes: {},

      noteWidth: DEFAULT_NOTE_WIDTH,

      bufferSize: 10,
      keyboardOpen: true,
    };


    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then((midi) => this.setState({midi: midi}));
    }
  }

  componentDidMount() {
    for (let i = 0; i < this.state.bufferSize; i++) {
      this.state.notes.pushRandom()
    }

    this.enterWaitMode();
  }

  midiInputs() {
    if (!this.state.midi) return;
    return [...this.state.midi.inputs.values()];
  }

  // called when held notes reaches 0
  checkForMiss() {
    N.event("sight_reading", "note", "miss");
    this.setState({
      misses: this.state.misses + 1,
      noteShaking: true,
      heldNotes: {},
      touchedNotes: {},
    });
    setTimeout(() => this.setState({noteShaking: false}), 500);
    return true;
  }

  // called on every noteOn
  checkForHit() {
    let touched = Object.keys(this.state.touchedNotes);
    if (this.state.notes.matchesHead(touched)) {
      N.event("sight_reading", "note", "hit");

      this.state.notes.shift();
      this.state.notes.pushRandom();

      this.setState({
        notes: this.state.notes,
        hits: this.state.hits + 1,
        noteShaking: false,
        heldNotes: {},
        touchedNotes: {},
      });

      this.state.slider.add(this.state.noteWidth);

      return true;
    } else {
      return false;
    }
  }

  pickInput(e) {
    e.preventDefault();
    let idx = this.refs.inputPicker.value;
    idx = parseInt(idx, 10);
    let input = this.midiInputs()[idx]

    if (!input) {
      return;
    }

    console.log(`Binding to: ${input.name}`)
    input.onmidimessage = this.onMidiMessage.bind(this);
    this.setState({currentInput: input});
  }

  pressNote(note) {
    this.state.heldNotes[note] = true;
    this.state.touchedNotes[note] = true;

    if (!this.checkForHit()) {
      this.forceUpdate();
    }
  }

  releaseNote(note) {
    // note might no longer be considered held if we just moved to next note
    if (this.state.heldNotes[note]) {
      delete this.state.heldNotes[note];
      if (Object.keys(this.state.heldNotes).length == 0) {
        this.checkForMiss();
      }
    }
  }

  onMidiMessage(message) {
    let [raw, pitch, velocity] = message.data;

    let cmd = raw >> 4,
      channel = raw & 0xf,
      type = raw & 0xf0;

    let n = noteName(pitch)

    if (NOTE_EVENTS[type] == "noteOn") {
      this.pressNote(n);
    }

    if (NOTE_EVENTS[type] == "noteOff") {
      this.releaseNote(n);
    }
  }

  render() {
    let setupToggleButton;
    if (!this.state.setupOpen) {
      setupToggleButton = <button
        onClick={this.toggleSetup.bind(this)}
        className="setup_toggle">
        Settings
      </button>;
    }

    return <div
      className={classNames("page_container", {
        keyboard_open: this.state.keyboardOpen,
        setup_open: this.state.setupOpen,
    })}>
      {this.renderWorkspace()}
      {this.renderKeyboard()}
      {this.renderSetup()}

      <a className="github_link" href="https://github.com/leafo/mursicjs">
        <img src="img/github-icon.svg" alt="GitHub Repository" />
      </a>

      {setupToggleButton}

      <button
        onClick={this.toggleKeyboard.bind(this)}
        className="keyboard_toggle">
        {this.state.keyboardOpen ? "Hide Keyboard" : "Show Keyboard"}
      </button>
    </div>;
  }

  renderSetup() {
    if (!this.state.setupOpen) {
      return;
    }

    let staves = Page.STAVES.map(function(staffConfig) {
      return <div
        key={staffConfig.name}
        onClick={function(e) {
          e.preventDefault();
          this.setState({ currentStaff: staffConfig });
        }.bind(this)}
        className={classNames("toggle_option", {
          active: this.state.currentStaff == staffConfig
        })}>
        {staffConfig.name}</div>;
    }.bind(this));

    return <div className="setup_panel">
      <div className="setup_header">
        <button
          onClick={this.toggleSetup.bind(this)}>
          Close</button>
        <h3>Settings</h3>
      </div>

      <div className="settings_group">
        <h4>Staves</h4>
        {staves}
      </div>

    </div>;
  }

  renderKeyboard() {
    if (!this.state.keyboardOpen) {
      return;
    }

    let [lower, upper] = this.state.currentStaff.range;

    return <Keyboard
      lower={lower}
      upper={upper}
      heldNotes={this.state.heldNotes}
      onKeyDown={this.pressNote.bind(this)}
      onKeyUp={this.releaseNote.bind(this)} />;
  }

  toggleMode() {
    if (this.state.mode == "wait") {
      this.enterScrollMode();
    } else {
      this.enterWaitMode();
    }
  }

  enterScrollMode() {
    if (this.state.slider) {
      this.state.slider.cancel();
    }

    this.setState({
      mode: "scroll",
      noteWidth: DEFAULT_NOTE_WIDTH * 2,
      slider: new SlideToZero({
        speed: 100,
        loopPhase: DEFAULT_NOTE_WIDTH * 2,
        onUpdate: this.setOffset.bind(this),
        onLoop: function() {
          this.state.notes.shift();
          this.state.notes.pushRandom();
          this.forceUpdate();
        }.bind(this)
      })
    });
  }

  enterWaitMode() {
    if (this.state.slider) {
      this.state.slider.cancel();
    }

    this.setState({
      mode: "wait",
      noteWidth: DEFAULT_NOTE_WIDTH,
      slider: new SlideToZero({
        speed: DEFAULT_SPEED,
        onUpdate: this.setOffset.bind(this)
      })
    })
  }

  setOffset(value) {
    if (!this.staff) { return; }
    this.staff.setOffset(value);
  }

  toggleSetup() {
    this.setState({
      setupOpen: !this.state.setupOpen
    });
    this.recalcFlex();
  }

  toggleKeyboard() {
    this.setState({keyboardOpen: !this.state.keyboardOpen});
    this.recalcFlex();
  }

  recalcFlex() {
    this.refs.workspace.style.height = "0px";
    this.refs.workspace.offsetHeight;
    this.refs.workspace.style.height = "auto";
  }

  renderWorkspace() {
    if (this.state.midi) {
      window.current_midi = this.state.midi;

      var inputSelect = <div className="input_picker">
        <select
          ref="inputPicker">
          {
            this.midiInputs().map((input, i) =>
              <option value={i} key={i}>{input.name}</option>)
          }
        </select>
        {" "}
        <button onClick={this.pickInput.bind(this)}>Connect</button>
        {this.state.currentInput ? <strong> Connected</strong> : null}
      </div>
    }

    let header = <div className="header">
      <div className="stats">

        <div className="stat_container">
          <div className="value">{this.state.hits}</div>
          <div className="label">hits</div>
        </div>

        <div className="stat_container">
          <div className="value">{this.state.misses}</div>
          <div className="label">misses</div>
        </div>
      </div>
      <h1>Sight reading trainer</h1>
    </div>;

    let debug = <div className="debug">
      <pre>
        held: {JSON.stringify(this.state.heldNotes)}
        {" "}
        pressed: {JSON.stringify(this.state.touchedNotes)}
      </pre>
    </div>;

    let modeToggle = <div className="tool">
      <span className="label">Mode</span>
      <div
        onClick={this.toggleMode.bind(this)}
        className={classNames("toggle_switch", {
          first: this.state.mode == "wait",
          second: this.state.mode == "scroll",
        })}>
        <span className="toggle_option">Wait</span>
        <span className="toggle_option">Scroll</span>
      </div>
    </div>

    let staff = <GrandStaff
      ref={(staff) => this.staff = staff}
      {...this.state} />;

    return <div ref="workspace" className="workspace">
      <div className="workspace_wrapper">
        {header}
        <div className="staff_wrapper">
          {staff}
        </div>
        <div className="toolbar">
          <div className="left_tools">
            {inputSelect}
          </div>
          {modeToggle}
        </div>
      </div>
    </div>;
  }

}

class Staff extends React.Component {
  static propTypes = {
    // rendering props
    upperLine: types.number.isRequired,
    lowerLine: types.number.isRequired,
    cleffImage: types.string.isRequired,
    staffClass: types.string.isRequired,

    // state props
    notes: types.object,
    heldNotes: types.object,
    inGrand: types.bool,
  }

  constructor(props) {
    super(props);
  }

  // skips react for performance
  setOffset(amount) {
    this.refs.notes.style.transform = `translate3d(${amount}px, 0, 0)`;
  }

  componentDidUpdate() {
    this.setOffset(this.props.slider.value);
  }

  render() {
    return <div className={classNames("staff", this.props.staffClass)}>
      <img className="cleff" src={this.props.cleffImage} />

      <div className="lines">
        <div className="line1 line"></div>
        <div className="line2 line"></div>
        <div className="line3 line"></div>
        <div className="line4 line"></div>
        <div className="line5 line"></div>
      </div>

      <div ref="notes" className="notes">
        {this.renderNotes()}
        {this.renderHeld()}
      </div>

    </div>;
  }

  renderHeld(notes) {
    // notes that are held down but aren't correct
    return Object.keys(this.props.heldNotes).map((note, idx) =>
      !this.props.notes.inHead(note) && this.renderNote(note, {
        key: `held-${idx}`,
        classes: { held: true }
      })
    );
  }

  renderNotes() {
    return this.props.notes.map(function(note, idx) {
      let opts = {
        goal: true,
        offset: this.props.noteWidth * idx,
        first: idx == 0,
      }

      if (Array.isArray(note)) {
        return note.map(function(sub_note, col_idx) {
          opts.key = `${idx}-${col_idx}`;
          return this.renderNote(sub_note, opts);
        }.bind(this));
      } else {
        opts.key = idx;
        return this.renderNote(note, opts);
      }

    }.bind(this));
  }

  renderLedgerLines(note, opts={}) {
    let pitch = parseNote(note);
    let fromLeft =  opts.offset || 0;
    let letterDelta = 0;
    let below = false;

    // above
    if (pitch > this.props.upperLine) {
      letterDelta = letterOffset(pitch) - letterOffset(this.props.upperLine);
    }

    // below
    if (pitch < this.props.lowerLine) {
      letterDelta = letterOffset(this.props.lowerLine) - letterOffset(pitch);
      below = true;
    }

    let numLines = Math.floor(letterDelta / 2);

    let lines = [];
    for (let i = 0; i < numLines; i++) {
      let style = {
        left: `${(opts.offset || 0) - 10}px`,
        width: `${40 + 20}`,
      }

      if (below) {
        style.top = `${100 + 25*(i + 1)}%`;
      } else {
        style.bottom = `${100 + 25*(i + 1)}%`;
      }

      lines.push(<div
        className={classNames("ledger_line", {
          above: !below,
          below: below
        })}
        style={style} />);
    }

    return lines;
  }

  renderNote(note, opts={}) {
    let pitch = parseNote(note);

    if (this.props.inGrand) {
      switch (this.props.staffClass) {
        case "f_staff":  // lower
          if (pitch >= MIDDLE_C_PITCH) {
            return;
          }
          break;
        case "g_staff":  // upper
          if (pitch < MIDDLE_C_PITCH) {
            return;
          }
          break;
      }
    }

    let fromTop = letterOffset(this.props.upperLine) - letterOffset(pitch);

    let style = {
      top: `${Math.floor(fromTop * 25/2)}%`,
      left: `${opts.offset || 0}px`
    }

    let outside = pitch > this.props.upperLine || pitch < this.props.lowerLine;

    let classes = classNames("whole_note", "note", {
      outside: outside,
      noteshake: this.props.noteShaking && opts.first,
      held: opts.goal && opts.first && this.props.heldNotes[note],
    }, opts.classes || {})

    let noteEl = <img
      key={opts.key}
      style={style}
      data-note={note}
      data-midi-note={pitch}
      className={classes}
      src="svg/noteheads.s0.svg" />;

    if (outside) {
      return [
        noteEl,
        this.renderLedgerLines(note, opts),
      ];
    } else {
      return noteEl;
    }
  }
}

class GStaff extends Staff {
  static defaultProps = {
    upperLine: 77,
    lowerLine: 64,
    cleffImage: "svg/clefs.G.svg",
    staffClass: "g_staff",
  }
}

class FStaff extends Staff {
  static defaultProps = {
    upperLine: 57,
    lowerLine: 57 - 13,
    cleffImage: "svg/clefs.F_change.svg",
    staffClass: "f_staff",
  }
}

class GrandStaff extends React.Component {
  // skips react for performance
  setOffset(amount) {
    if (!this.gstaff) {
      return;
    }

    this.gstaff.setOffset(amount);
    this.fstaff.setOffset(amount);
  }

  render() {
    return <div className="grand_staff">
      <GStaff
        ref={(s) => this.gstaff = s}
        inGrand={true}
        {...this.props} />
      <FStaff
        ref={(s) => this.fstaff = s}
        inGrand={true}
        {...this.props} />
    </div>;
  }
}

class Keyboard extends React.Component {
  static propTypes = {
    lower: types.oneOfType([types.string, types.number]),
    upper: types.oneOfType([types.string, types.number]),
    heldNotes: types.object,
  }

  defaultLower = "C5"
  defaultUpper = "B6"

  constructor(props) {
    super(props);
  }

  isBlack(pitch) {
    return LETTER_OFFSETS[pitch % 12] === undefined;
  }

  isC(pitch) {
    return LETTER_OFFSETS[pitch % 12] === 0;
  }

  onClickKey(e) {
    e.preventDefault();
    if (this.props.onClickKey) {
      this.props.onClickKey(e.target.dataset.note);
    }
  }

  onKeyDown(e) {
    e.preventDefault();
    let note = e.target.dataset.note;

    if (this.props.onKeyDown) {
      this.props.onKeyDown(note);
    }

    if (this.props.onKeyUp) {
      let onUp = function(e) {
        e.preventDefault();
        if (this.props.onKeyUp) {
          this.props.onKeyUp(note);
        }
        document.removeEventListener("mouseup", onUp);
      }.bind(this);
      document.addEventListener("mouseup", onUp);
    }
  }

  render() {
    let keys = [];
    let lower = this.props.lower || this.defaultLower;
    let upper = this.props.upper || this.defaultUpper;

    if (typeof lower == "string") {
      lower = parseNote(lower);
    }

    if (typeof upper == "string") {
      upper = parseNote(upper);
    }

    if (lower >= upper) {
      throw "lower must be less than upper for keyboard";
    }

    for (let pitch = lower; pitch <= upper; pitch++) {
      let black = this.isBlack(pitch);
      let name = noteName(pitch);

      let classes = classNames("key", {
        labeled: this.isC(pitch),
        white: !black,
        black: black,
        held: this.props.heldNotes && this.props.heldNotes[name]
      });

      keys.push(<div key={pitch} className="key_wrapper">
        <div
          onMouseDown={this.onKeyDown.bind(this)}
          data-note={name}
          className={classes} />
      </div>);
    }

    return <div className="keyboard">{keys}</div>
  }
}
