// 定时回收文件以及处理上传失败的文件夹
import { log4js } from "@/log";
import * as fs from "fs";
const FileHound = require('filehound')
import { join } from 'path'

import { FileStatus } from "@/type/fileStatus";
import { deleteFolder } from "@/util/utils";
import { uploadStatus } from "@/uploader/uploadStatus";
import { uploader } from "@/uploader";
import { StreamInfo } from "@/type/streamInfo";
import { RoomStatusPath } from "@/engine/roomPathStatus";
import { Scheduler } from "@/type/scheduler";

const logger = log4js.getLogger(`recycleFile`);

const interval = 1000 * 60 * 3
// const interval = 1000 * 20
export default new Scheduler(interval, async function () {
    logger.info(`Task recycleFile Start ...`)

    function _deleteLocalFile(obj: FileStatus) {
        logger.info(`_deleteLocalFile ${obj.recorderName}`)
        if (!obj.path) throw (`NOT FOUND THE FILE PATH`);
        if (!obj.deleteLocalFile) throw (`[User Config] ${obj.path} Don't Delete The File SKIP...`);
        if (!obj.endRecordTime) {
            logger.info(`Not Fount endRecordTime... Use startRecordTime ${obj.startRecordTime} to replace`)
            obj.endRecordTime = obj.startRecordTime
        }

        if (RoomStatusPath.get(obj.path) === 1) throw (`该目录正在存放录制文件 跳过 ${obj.recorderName} ${obj.path}`);

        if (uploadStatus.get(obj.path) === 1) throw (`该目录正在上传 跳过 ${obj.recorderName} ${obj.path}`)

        const time = Math.floor((new Date().valueOf() - new Date(obj.endRecordTime as Date).valueOf()) / (1000 * 60 * 60 * 24))
        const delayTime = obj.delayTime || require('../../templates/info.json').StreamerHelper.delayTime || 2

        if (time >= delayTime && obj.isPost) {
            logger.info(`Time to delete file ${obj.path}`)
            try {
                deleteFolder(obj.path || '')
                logger.info(`Delete folder succeed !! ${obj.path}`)
            } catch (e) {
                throw (`Delete folder fail !! ${obj.path} ${e}`)
            }
        }
        logger.info(`_deleteLocalFile ${obj.recorderName}`)
    }

    function _uploadLocalFile(obj: FileStatus) {

        logger.info(`_uploadLocalFile ${obj.recorderName}`)

        if (!obj.uploadLocalFile) throw (`[User Config] ${obj.path} Don't Upload The File SKIP...`);

        if (!obj.path) throw (`NOT FOUND THE FILE PATH`);

        if (RoomStatusPath.get(obj.path) === 1) throw (`该目录正在存放录制文件 跳过 ${obj.recorderName} ${obj.path}`);

        if (uploadStatus.get(obj.path) === 1) throw (`该目录正在上传 跳过 ${obj.recorderName} ${obj.path}`)

        let stream: StreamInfo = {
            copyright: obj.copyright,
            deleteLocalFile: obj.deleteLocalFile,
            desc: obj.desc,
            dirName: obj.path,
            dynamic: obj.dynamic,
            roomLink: obj.recorderLink || '',
            roomName: obj.recorderName || '',
            roomTags: obj.tags || [],
            roomTid: obj.tid || 0,
            source: obj.source,
            streamUrl: '',
            templateTitle: obj.templateTitle,
            uploadLocalFile: obj.uploadLocalFile,
            timeV: obj.timeV
        }


        if (obj.path != null) {
            logger.info(`NEW Upload ${stream.roomName} ${stream.dirName}`);
            const uploadTask = new uploader(stream)
            uploadTask.upload().catch((e) => {
                logger.error(e)
            })
        }
        logger.info(`_uploadLocalFile ${obj.recorderName}`)

    }

    console.log('uploadStatus', uploadStatus)
    const files: string[] = await FileHound.create()
        .paths(join(process.cwd(), "/download"))
        .match('fileStatus.json')
        .ext('json')
        .find();

    if (!files) return

    for (const file of files) {
        const text = fs.readFileSync(file)
        const obj: FileStatus = JSON.parse(text.toString())

        logger.debug(`file ${file} ${JSON.stringify(obj, null, 2)}`)
        try {
            //  Check uploadLocalFile
            if (obj.uploadLocalFile && !obj.isPost) _uploadLocalFile(obj)
        } catch (e) {
            logger.error(e)
        }

        try {
            //  Check deleteLocalFile
            if (obj.deleteLocalFile) _deleteLocalFile(obj)
        } catch (e) {
            logger.error(e)
        }

    }
})