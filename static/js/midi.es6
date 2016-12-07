export const MIDDLE_C_PITCH = 60

export const NOTE_EVENTS = {
  [144]: "noteOn",
  [128]: "noteOff"
}

export class MidiChannel {
  constructor(output, channel) {
    this.output = output

    if (channel > 15 || channel < 0) {
      throw "invalid channel:" + channel
    }

    this.channel = channel
  }

  setInstrument(programNumber) {
    this.output.send([
      12 << 4 + this.channel,
      programNumber
    ])
  }

  playNoteList(list, delay=500) {
    list = [...list] // copy to avoid edits
    let idx = 0
    let playNextColumn = () => {
      if (idx >= list.length) {
        this.playing = false
        return
      }

      this.playing = true
      let col = list[idx]
      for (let note of col) {
        this.noteOn(parseNote(note), 100)
      }

      setTimeout(() => {
        let col = list[idx]
        for (let note of col) {
          this.noteOff(parseNote(note))
        }
        idx += 1
        playNextColumn()
      }, delay)
    }

    playNextColumn()
  }


  testNote() {
    // play middle C for 1 second
    console.log("playing test note")
    this.noteOn(MIDDLE_C_PITCH, 100)
    setTimeout(() => {
      console.log("stopping test note")
      this.noteOff(MIDDLE_C_PITCH)
    }, 500)
  }

  noteOn(pitch, velocity) {
    this.output.send([
      9 << 4 + this.channel,
      pitch,
      velocity
    ])
  }

  noteOff(pitch) {
    this.output.send([
      8 << 4 + this.channel,
      pitch,
      0
    ])
  }
}
