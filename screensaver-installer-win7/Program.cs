using System;
using System.IO;
using System.IO.Compression;
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
                string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "时间景观屏保");
                string scrPath = Path.Combine(installDir, "时间景观.scr");

                // 1. 内嵌 zip 写入临时文件
                string tmpZip = Path.Combine(Path.GetTempPath(), "timeview-win7-scr.zip");
                using (var s = typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))
                {
                    if (s == null) throw new Exception("安装包内缺少屏保文件");
                    using (var fs = new FileStream(tmpZip, FileMode.Create, FileAccess.Write))
                        s.CopyTo(fs);
                }

                // 2. 解压到安装目录
                if (Directory.Exists(installDir)) Directory.Delete(installDir, true);
                Directory.CreateDirectory(installDir);
                ZipFile.ExtractToDirectory(tmpZip, installDir);
                File.Delete(tmpZip);

                // 3. 还原屏保文件名（zip 内为避免中文乱码存成 screensaver.scr）
                string asciiScr = Path.Combine(installDir, "screensaver.scr");
                if (!File.Exists(asciiScr)) throw new Exception("解压后未找到 screensaver.scr");
                if (File.Exists(scrPath)) File.Delete(scrPath);
                File.Move(asciiScr, scrPath);

                // 4. 注册屏保
                using (var k = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop", true))
                {
                    if (k == null) throw new Exception("无法打开注册表项");
                    k.SetValue("SCRNSAVE.EXE", scrPath);
                    k.SetValue("ScreenSaveActive", "1");
                    k.SetValue("ScreenSaveTimeOut", "600");
                }

                MessageBox.Show(
                    "时间景观屏保（Win7 兼容版）已安装成功！\n\n" +
                    "安装目录：\n" + installDir + "\n\n" +
                    "屏保已注册，等待时间默认 10 分钟。\n" +
                    "卸载：删除上述目录即可。",
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
