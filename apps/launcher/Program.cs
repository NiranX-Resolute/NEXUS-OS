using System;
using System.IO;
using System.Drawing;
using System.Diagnostics;
using System.Windows.Forms;

namespace NexusSuiteLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    public class LauncherForm : Form
    {
        public LauncherForm()
        {
            this.Text = "NEXUS AI Suite — Unified Ecosystem Launcher";
            this.Size = new Size(680, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(7, 9, 14);
            this.ForeColor = Color.White;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;

            // Header Title
            Label title = new Label
            {
                Text = "NEXUS AI ECOSYSTEM",
                Font = new Font("Segoe UI", 22, FontStyle.Bold),
                ForeColor = Color.FromArgb(56, 189, 248),
                Location = new Point(30, 24),
                AutoSize = true
            };
            this.Controls.Add(title);

            Label sub = new Label
            {
                Text = "Universal Zero-Cost Autonomous & Assistive Suite for Windows",
                Font = new Font("Segoe UI", 11, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(32, 68),
                AutoSize = true
            };
            this.Controls.Add(sub);

            // Button 1: Nexus Companion
            Button btnCompanion = CreateAppButton(
                "🤝 Launch Nexus Companion (Daily Living Agent)",
                "WebGazer webcam pupil tracking, OpenAAC pictograms, medicine & scene reader, emergency SOS.",
                Color.FromArgb(255, 255, 0),
                Color.Black,
                110,
                delegate { LaunchExecutable("nexus-companion.exe", @"nexus-companion\nexus-companion.exe"); }
            );
            this.Controls.Add(btnCompanion);

            // Button 2: Nexus Scholar
            Button btnScholar = CreateAppButton(
                "🎓 Launch Nexus Scholar (Accessible Student Studio)",
                "Diagram sonifier, Leitner 5-box gaze flashcards, OpenDyslexic & Bionic reading, Socratic audio tutor.",
                Color.FromArgb(56, 189, 248),
                Color.Black,
                220,
                delegate { LaunchExecutable("nexus-scholar.exe", @"nexus-scholar\nexus-scholar.exe"); }
            );
            this.Controls.Add(btnScholar);

            // Button 3: Nexus AI Core Workstation
            Button btnWorkstation = CreateAppButton(
                "🚀 Launch Nexus AI Core Workstation",
                "Full autonomous desktop agent with screen-use, vision grounding, and multi-model routing.",
                Color.FromArgb(16, 185, 129),
                Color.Black,
                330,
                delegate { LaunchWorkstation(); }
            );
            this.Controls.Add(btnWorkstation);

            // Footer
            Label footer = new Label
            {
                Text = "Press 1 for Companion | Press 2 for Scholar | Press 3 for Core Workstation",
                Font = new Font("Segoe UI", 10, FontStyle.Italic),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(32, 460),
                AutoSize = true
            };
            this.Controls.Add(footer);

            this.KeyPreview = true;
            this.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.D1 || e.KeyCode == Keys.NumPad1) btnCompanion.PerformClick();
                else if (e.KeyCode == Keys.D2 || e.KeyCode == Keys.NumPad2) btnScholar.PerformClick();
                else if (e.KeyCode == Keys.D3 || e.KeyCode == Keys.NumPad3) btnWorkstation.PerformClick();
                else if (e.KeyCode == Keys.Escape) this.Close();
            };
        }

        private Button CreateAppButton(string title, string description, Color bg, Color fg, int top, Action onClick)
        {
            Button btn = new Button
            {
                Location = new Point(30, top),
                Size = new Size(600, 85),
                BackColor = Color.FromArgb(21, 29, 51),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                TextAlign = ContentAlignment.TopLeft,
                Padding = new Padding(16, 12, 16, 12),
                Font = new Font("Segoe UI", 13, FontStyle.Bold)
            };
            btn.FlatAppearance.BorderColor = bg;
            btn.FlatAppearance.BorderSize = 2;
            btn.Text = title + "\n" + description;

            btn.Click += delegate { onClick(); };
            btn.MouseEnter += delegate { btn.BackColor = bg; btn.ForeColor = fg; };
            btn.MouseLeave += delegate { btn.BackColor = Color.FromArgb(21, 29, 51); btn.ForeColor = Color.White; };

            return btn;
        }

        private void LaunchExecutable(string name, string relativePath)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string p1 = Path.Combine(baseDir, name);
            string p2 = Path.Combine(baseDir, relativePath);
            string p3 = Path.Combine(baseDir, "..", name);
            string p4 = Path.Combine(baseDir, "..", relativePath);

            string target = File.Exists(p1) ? p1 : (File.Exists(p2) ? p2 : (File.Exists(p3) ? p3 : (File.Exists(p4) ? p4 : null)));

            if (target != null)
            {
                Process.Start(new ProcessStartInfo(target) { WorkingDirectory = Path.GetDirectoryName(target) });
            }
            else
            {
                MessageBox.Show(string.Format("Could not locate {0}. Please ensure binary is compiled in release_binaries.", name), "Nexus Launcher", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void LaunchWorkstation()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string[] candidates = new string[]
            {
                Path.Combine(baseDir, "nexus-setup.exe"),
                Path.Combine(baseDir, "..", "release_binaries", "nexus-setup.exe"),
                Path.Combine(baseDir, "..", "Nexus-desktop-", "dist", "Nexus AI 2.2.0.exe"),
                Path.Combine(baseDir, "..", "Nexus-desktop-", "dist", "nexus-ai-2.2.0-setup.exe")
            };

            foreach (string c in candidates)
            {
                if (File.Exists(c))
                {
                    Process.Start(new ProcessStartInfo(c) { WorkingDirectory = Path.GetDirectoryName(c) });
                    return;
                }
            }

            string batCandidate = Path.Combine(baseDir, "..", "launch-nexus-all.bat");
            if (File.Exists(batCandidate))
            {
                Process.Start(new ProcessStartInfo("cmd.exe", "/c \"" + batCandidate + "\"") { WorkingDirectory = Path.GetDirectoryName(batCandidate) });
                return;
            }

            MessageBox.Show("Core Workstation executable or launch-nexus-all.bat not found.", "Nexus Launcher", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
