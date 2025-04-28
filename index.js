import { program } from "commander"
import chalk from "chalk"
import ora from "ora"
import fs from "fs"
import path from "path"
import * as tar from "tar"
import AdmZip from "adm-zip"
import zlib from "zlib"
import cron from "node-cron"

// console.log(chalk.blue(figlet.textSync("Log Archive", { horizontalLayout: "full" })))

const configPath = path.resolve(".logarchiverc.json")
let config = {}
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"))
}

program
  .version("1.0.0")
  .description("Archive logs with scheduling, format options, and permission control")
  .option("-d, --directory <path>", "Source log directory")
  .option("-o, --output <path>", "Destination directory")
  .option("-f, --format <type>", "Archive format (tar.gz | zip | gz)", "tar.gz")
  .option("-s, --schedule <cron>", "Schedule (CRON format)")



program.action(async () => {
  const options = { ...config, ...program.opts() }

  const sourceDir = path.resolve(options.directory)
  const destDir = path.resolve(options.output)
  const format = options.format.replace(/^\./, "")


  const compressLogs = async () => {
    const spinner = ora("🔍 Scanning for .log files...").start()
  
    if (!fs.existsSync(sourceDir)) {
      spinner.fail(`Source directory does not exist: ${sourceDir}`)
      return
    }
  
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
  
    const walkFolders = dir => {
      let results = []
      const list = fs.readdirSync(dir)
      list.forEach(file => {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat && stat.isDirectory()) {
          results.push(fullPath)
          results = results.concat(walkFolders(fullPath))
        }
      })
      return results
    }
  
    const allDirs = [sourceDir, ...walkFolders(sourceDir)]
  
    for (const dir of allDirs) {
      const files = fs.readdirSync(dir)
      const logFiles = files.filter(f => f.endsWith(".log"))
  
      if (logFiles.length === 0) continue
  
      const relativeName = path.relative(sourceDir, dir) || "root"
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)
      const archiveName = `logs_${relativeName.replace(/[\\/]/g, "_")}_${timestamp}.${format}`
      const archivePath = path.join(destDir, archiveName)
  
      spinner.text = `📦 Compressing ${relativeName} logs to ${format}...`
  
      try {
        switch (format) {
          case "tar.gz":
            await tar.c({ gzip: true, file: archivePath, cwd: dir }, logFiles)
            break
          case "zip":
            const zip = new AdmZip()
            logFiles.forEach(file => zip.addLocalFile(path.join(dir, file)))
            zip.writeZip(archivePath)
            break
          case "gz":
            logFiles.forEach(file => {
              const input = fs.createReadStream(path.join(dir, file))
              const output = fs.createWriteStream(path.join(destDir, `${relativeName}_${file}.gz`))
              input.pipe(zlib.createGzip()).pipe(output)
            })
            break
          default:
            throw new Error("Unsupported format")
        }
  
        spinner.succeed(`✅ Archived ${logFiles.length} logs from: ${relativeName}`)
        spinner.start() // restart spinner for next round
      } catch (err) {
        spinner.fail(`❌ Failed to archive ${relativeName}`)
        console.error(err)
      }
    }
  
    spinner.succeed("🎉 All log folders processed.")
  }
  

  if (options.schedule) {
    console.log(chalk.yellow(`🕒 Scheduled at: ${options.schedule}`))
    cron.schedule(options.schedule, compressLogs)
  } else {
    await compressLogs()
  }
})

program.parse(process.argv)
