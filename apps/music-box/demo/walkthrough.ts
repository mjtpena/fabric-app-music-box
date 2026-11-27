import type { DemoScript } from '@x10/shared/demo';

const LEAD = 'demo-lead-morgan';
const OWNER = 'demo-owner-dana';

export const script: DemoScript = {
  title: 'Music Box: shared campaign send calendar with fatigue caps, quiet hours, warm-up waves, and auto-pause',
  persona: LEAD,
  scenes: [
    {
      id: 'hook',
      say: [
        'Five teams scheduling fourteen holiday campaigns on the same day means one subscriber gets seven messages before noon.',
        'Music Box turns the shared send calendar into a brass music-box cylinder where every segment is a row, the circumference is twenty-four hours, and every campaign is a steel pin.',
      ],
      async run(h) {
        await h.goto('/', LEAD);
        await h.pause(3500);
      },
    },
    {
      id: 'collisions',
      say: [
        'Pins in overlapping segments within two hours glow amber and link with a tie, while any segment over its daily cap is rimmed red.',
        'Switch the lens to Channel to see Email, SMS, and Push lined up against the three-tine comb.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Channel/ }));
        await h.pause(3000);
      },
    },
    {
      id: 'today',
      say: [
        'Today ranks the immediate risks: VIP Winter Buyers at four point two expected emails against a cap of three, an SMS wave at six-ten in Chicago, and a campaign paused at zero point seven percent unsubscribes.',
      ],
      async run(h) {
        await h.spotlight(h.page.getByRole('complementary', { name: 'Today' }), 2500);
        await h.click(h.page.getByRole('button', { name: /VIP Winter Buyers over cap/ }));
        await h.pause(2800);
      },
    },
    {
      id: 'view-as',
      say: ['Toggle View As between Campaign owner and Messaging lead to isolate overrides, quiet-hour blocks, and paused sends.'],
      async run(h) {
        await h.page.keyboard.press('Escape');
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Owner' }));
        await h.pause(2500);
      },
    },
    {
      id: 'pinning-quiet',
      say: [
        'In Pinning, scheduling an SMS at twelve-ten UTC flags the six-ten Chicago wave as a quiet-hour violation and locks the schedule button.',
        'Shifting the send to sixteen-ten UTC brings every recipient time zone inside eight to twenty-one hundred.',
      ],
      async run(h) {
        await h.goto('/pinning', OWNER);
        await h.fill(h.page.getByLabel(/Campaign name/), 'Holiday SMS Drop');
        await h.select(h.page.getByLabel('Channel'), 'SMS (cap 1/day)');
        await h.fill(h.page.getByLabel('Send time (UTC)'), '12:10');
        await h.spotlight(h.page.getByTestId('quiet-hours-panel'), 2800);
        await h.fill(h.page.getByLabel('Send time (UTC)'), '16:10');
        await h.pause(2200);
      },
    },
    {
      id: 'pinning-cap',
      say: [
        'Switching back to Email on Holiday Gifters, which is already at three expected touches, blocks a fourth send until the Messaging lead enters a twenty-character override reason.',
      ],
      async run(h) {
        await h.select(h.page.getByLabel('Channel'), 'Email (cap 3/day)');
        await h.spotlight(h.page.getByTestId('cap-breach-alert'), 2800);
      },
    },
    {
      id: 'stop',
      say: [
        'In Stop, a campaign that hit zero point seven two percent unsubscribes after two thousand five hundred deliveries is paused automatically, and only the Messaging lead can resume it.',
      ],
      async run(h) {
        await h.goto('/stop', LEAD);
        await h.spotlight(h.page.getByTestId('paused-row-Lapsed Win-Back Blast'), 2800);
      },
    },
    {
      id: 'close',
      say: ['Music Box: one shared calendar, clear overlap arithmetic, and zero silent fatigue spikes.'],
      async run(h) {
        await h.goto('/', LEAD);
        await h.pause(3500);
      },
    },
  ],
};
