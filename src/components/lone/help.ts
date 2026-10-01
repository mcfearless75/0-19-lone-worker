/** Plain-English help shown behind the ? button on each screen. */
export const help = {
  home: [
    "Red alert: press and hold the red button for 1.5 seconds, then let go. Straight away your duty mobiles get a WhatsApp and your alert emails get an email, with your location on a map and the nearest postcode.",
    "Start a job: say where you are going and set a welfare timer. If the timer runs out and you have not ended the job, your duty mobiles and alert emails are messaged automatically, as long as the app is open.",
    "Amber note: before something risky, say or type what you are walking into. If you raise an alert in the next 12 hours, the note goes with it.",
    "Keep this page open while you work. The app can only send while it is on screen.",
    "Desk shows the log kept on this phone. Board shows your team's live positions. Routes is where you set who gets your alerts.",
  ],
  alert: [
    "Your alert has already gone to your duty mobiles and alert emails. The line at the top says exactly what went.",
    "If you can, add detail (what is happening, who is with you) and send it on with the buttons below.",
    "False alarm stands the alert down and clears you from the board. Only use it if you are safe.",
  ],
  startJob: [
    "Site: the place name, e.g. Riverside Surgery.",
    "Address: type the street or the postcode. A green tick means the postcode is real and the job is pinned there. A red warning means the postcode does not exist, so check it.",
    "Welfare timer: how long you expect to be. You get a warning before it ends. If it runs out before you end the job, a welfare alert goes to your duty mobiles and alert emails, as long as the app is open.",
    "Note for the desk: anything a responder should know, like a code for the door or a dog on site.",
  ],
  amberNote: [
    "Use this just before a risky moment: going into a property, meeting someone new, a gate left open.",
    "Type a note, record your voice, or both, then press Save.",
    "Nobody is messaged when you save. If you raise a Red alert within 12 hours, your last 3 notes are added to the alert, and the recordings are attached to the alert email.",
    "If there is no signal, you can save on this phone only. That copy will not go out with an alert.",
  ],
  desk: [
    "This is the log kept on this phone: alerts, jobs and amber notes, newest first.",
    "Other people cannot see this page. To see everyone at once, use the Board.",
    "Acknowledge marks an alert as seen. Resolve closes it with a note of what happened.",
  ],
  board: [
    "The Board shows everyone on your team, with their last position and any open alert.",
    "Everyone on the team types the same board code (4 to 8 letters or numbers). Anyone with the code can see the pins, so keep it to your team.",
    "A pin updates while that person has the app open.",
  ],
  routes: [
    "This is where your alerts go. Set it once and test it.",
    "Duty mobiles: up to 8 numbers that get a WhatsApp the moment you raise an alert. Each person must have joined the WhatsApp service first (ask your manager for the join message).",
    "Alert emails: up to 8 addresses, separated by commas. Each one gets an email at the same moment, with any voice notes attached.",
    "WhatsApp group link only opens the group on your phone. It cannot post into the group by itself. The duty mobiles are what actually gets messaged.",
    "Discreet screen: after an alert, the phone shows a plain screen so nobody nearby can see that an alert went out.",
  ],
} as const;
