import { describe, expect, it } from 'vitest';
import { errorMessage } from '../miniprogram/ui/error-message';

describe('面向用户的错误说明', () => {
  it.each([
    new Error("unlinkSync:fail no such file or directory, unlink 'wxfile://usr/account/index.json.bak'"),
    { errMsg: 'writeFileSync:fail quota exceeded' },
    new Error('读取失败 wxfile://usr/private/index.json'),
    new Error('无法读取文件 /usr/private/index.json'),
    new Error('[{"message":"数据不符","path":["snapshot"]}]'),
    new Error('Internal Server Error'),
  ])('隐藏底层异常，保留当前操作的中文补救', error => {
    expect(errorMessage(error, '保存失败，请重试或导出当前内容。')).toBe('保存失败，请重试或导出当前内容。');
  });
  it.each(['设备空间不足，暂时无法保存。请腾出空间后重试。', '头像超过 2MB，请选择较小的图片。', '账号云容量已满，请先导出并清理不需要的作品。'])('保留真实业务失败原因：%s', message => {
    expect(errorMessage(new Error(message), '操作失败，请重试。')).toBe(message);
  });
});
