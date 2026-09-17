using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace TimeViewInstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                string sysDir = Environment.GetFolderPath(Environment.SpecialFolder.System);
                string target = Path.Combine(sysDir, "时间景观.scr");

                // 1. 把内嵌的屏保文件写入 System32
                using (var s = typeof(Program).Assembly.GetManifestResourceStream("screensaver.bin"))
                {
                    if (s == null) throw new Exception("安装包内缺少屏保文件");
                    using (var fs = new FileStream(target, FileMode.Create, FileAccess.Write))
                        s.CopyTo(fs);
                }

                // 2. 注册屏保（当前用户）
                using (var k = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop", true))
                {
                    if (k == null) throw new Exception("无法打开注册表项");
                    k.SetValue("SCRNSAVE.EXE", target);
                    k.SetValue("ScreenSaveActive", "1");
                    k.SetValue("ScreenSaveTimeOut", "600");
                }

                MessageBox.Show(
                    "时间景观屏保已安装成功！\n\n" +
                    "屏保已注册，等待时间默认 10 分钟。\n" +
                    "可在「设置 → 个性化 → 锁屏界面 → 屏幕保护程序」查看或调整。\n\n" +
                    "卸载：删除 C:\\Windows\\System32\\时间景观.scr 即可。",
                    "时间景观屏保 · 安装完成",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("安装失败：" + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
